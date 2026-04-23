/**
 * Executor — Plan execution with DAG-scheduled parallel waves
 *
 * /execute [plan-file] does:
 *   1. Split plan into sections
 *   2. Analyze dependencies between sections (LLM call)
 *   3. Build DAG → topological sort → parallel waves
 *   4. Execute each wave in parallel (builder subagents)
 *   5. Run checker after all waves complete
 *   6. If checks fail, retry (max 3 attempts)
 *   7. Write STATUS.md for resume on context reset
 */

import type { ExtensionAPI, ExtensionContext } from "@mariozechner/pi-coding-agent";
import { Text, truncateToWidth } from "@mariozechner/pi-tui";
import { Type } from "@sinclair/typebox";
import * as fs from "node:fs";
import * as path from "node:path";
import { runAgent, MODELS } from "./_shared.js";

// ── Module Metadata ─────────────────────────────────────────────────

export const module = {
	id: "executor",
	name: "Plan Executor",
	description: "Execute plans with DAG-scheduled parallel waves, builder + checker subagents, and STATUS.md resume",
	systemPromptWhenEnabled: `### Plan Executor
Use /execute <plan-file> or the execute_plan tool to execute a plan:
1. Splits the plan into sections and analyzes dependencies
2. Builds a DAG and schedules sections into parallel waves
3. Independent sections run simultaneously as builder subagents
4. Checker subagent runs tests, lint, type-check after all waves complete
5. If checks fail, builder gets feedback and retries (max 3 attempts)
6. Progress is saved to STATUS.md — resume with /execute if interrupted

Plans are markdown files, typically in docs/plans/.`,
};

// ── Config ──────────────────────────────────────────────────────────

const BUILDER_MODEL = MODELS.build;
const CHECKER_MODEL = MODELS.check;
const MAX_ATTEMPTS = 3;

const BUILDER_PROMPT = `You are a senior engineer implementing a plan.

Follow the plan precisely, task by task:
- Write tests first where the plan calls for it
- Implement clean, production-quality code
- If something is unclear, make a reasonable choice and note it
- Do NOT skip any tasks. Work through them in order.

When done, output a brief summary of what you implemented and any decisions you made.`;

const CHECKER_PROMPT = `You are a QA engineer verifying an implementation.

Run these checks in order:
1. Run the test suite (detect the framework: jest, vitest, pytest, go test, cargo test, etc.)
2. Run the type checker if applicable (tsc, mypy, etc.)
3. Run the linter if configured (eslint, ruff, clippy, etc.)

Report PASS or FAIL.
If FAIL, list every failing check with:
- The exact error output (truncated to relevant lines)
- Which file/line is affected
- A suggested fix

Be strict. Any test failure or type error is a FAIL.
Be efficient. Run tests first — if they pass, skip linting unless it's fast.`;

const DEPENDENCY_PROMPT = `You are analyzing a plan's sections to determine execution dependencies.

Given numbered sections of a plan, determine which sections depend on which.
A section DEPENDS on another if it modifies files that the other creates,
or if it references types/functions/APIs introduced by the other.

Sections that work on completely unrelated parts of the codebase are INDEPENDENT.

Respond with ONLY a JSON object mapping section index to its dependency indices:
{
  "dependencies": {
    "0": [],
    "1": [0],
    "2": [0],
    "3": [1, 2]
  }
}

If ALL sections are independent, every array should be empty.
If you're unsure, err on the side of adding a dependency (safer).`;

// ── Plan Splitter ───────────────────────────────────────────────────

interface PlanSection {
	index: number;
	title: string;
	content: string;
}

function splitPlan(planContent: string): PlanSection[] {
	const lines = planContent.split("\n");
	const sections: PlanSection[] = [];
	let current: { title: string; lines: string[] } | null = null;

	for (const line of lines) {
		const match = line.match(/^##\s+(?:Task|Step|Phase|Part|Section)\s*\d*[:.—-]\s*(.*)/i);
		if (match) {
			if (current) sections.push({ index: sections.length, title: current.title, content: current.lines.join("\n") });
			current = { title: match[1] || line.replace(/^##\s*/, ""), lines: [line] };
		} else if (current) {
			current.lines.push(line);
		} else {
			if (!sections.length) {
				if (!current) current = { title: "Plan", lines: [] };
				current.lines.push(line);
			}
		}
	}
	if (current) sections.push({ index: sections.length, title: current.title, content: current.lines.join("\n") });

	const substantial = sections.filter(s => s.content.length > 200);
	if (substantial.length < 2) return [{ index: 0, title: "Full Plan", content: planContent }];
	return sections;
}

// ── DAG Builder ─────────────────────────────────────────────────────

interface DAG {
	/** For each section index, list of indices it depends on */
	dependencies: Record<number, number[]>;
}

/** Analyze dependencies between plan sections using an LLM call */
async function analyzeDependencies(
	sections: PlanSection[],
	cwd: string,
	signal?: AbortSignal,
): Promise<DAG> {
	if (sections.length <= 1) {
		return { dependencies: { 0: [] } };
	}

	const sectionSummaries = sections.map((s, i) =>
		`### Section ${i}: ${s.title}\n${s.content.slice(0, 500)}`
	).join("\n\n");

	try {
		const result = await runAgent({
			cwd,
			model: MODELS.check, // Use a fast model for analysis
			systemPrompt: DEPENDENCY_PROMPT,
			tools: "",
			task: `Analyze these ${sections.length} plan sections and determine dependencies:\n\n${sectionSummaries}`,
			signal,
			timeout: 30,
		});

		const jsonMatch = result.output.match(/\{[\s\S]*"dependencies"[\s\S]*\}/);
		if (jsonMatch) {
			const parsed = JSON.parse(jsonMatch[0]) as DAG;
			// Validate: all indices must be within range
			const valid: DAG = { dependencies: {} };
			for (let i = 0; i < sections.length; i++) {
				const deps = parsed.dependencies?.[i] || parsed.dependencies?.[String(i)] || [];
				valid.dependencies[i] = (deps as number[]).filter(
					(d: number) => typeof d === "number" && d >= 0 && d < sections.length && d !== i
				);
			}
			return valid;
		}
	} catch {
		// Fall through to sequential
	}

	// Fallback: sequential chain (each depends on previous)
	const deps: DAG = { dependencies: {} };
	for (let i = 0; i < sections.length; i++) {
		deps.dependencies[i] = i > 0 ? [i - 1] : [];
	}
	return deps;
}

/** Topological sort into waves — each wave contains sections that can run in parallel */
function buildWaves(sections: PlanSection[], dag: DAG): PlanSection[][] {
	const n = sections.length;
	const inDegree = new Array(n).fill(0);
	const adjList: number[][] = new Array(n).fill(null).map(() => []);

	// Build reverse adjacency (who unblocks whom)
	for (let i = 0; i < n; i++) {
		const deps = dag.dependencies[i] || [];
		inDegree[i] = deps.length;
		for (const dep of deps) {
			adjList[dep].push(i);
		}
	}

	// Kahn's algorithm — group by waves
	const waves: PlanSection[][] = [];
	const completed = new Set<number>();
	let remaining = n;

	while (remaining > 0) {
		const wave: PlanSection[] = [];
		for (let i = 0; i < n; i++) {
			if (!completed.has(i) && inDegree[i] === 0) {
				wave.push(sections[i]);
				completed.add(i);
			}
		}

		if (wave.length === 0) {
			// Cycle detected — dump all remaining into one wave
			for (let i = 0; i < n; i++) {
				if (!completed.has(i)) {
					wave.push(sections[i]);
					completed.add(i);
				}
			}
		}

		// Update in-degrees
		for (const sec of wave) {
			for (const unblocked of adjList[sec.index]) {
				inDegree[unblocked]--;
			}
		}

		waves.push(wave);
		remaining -= wave.length;
	}

	return waves;
}

// ── STATUS.md Resume ────────────────────────────────────────────────

interface ExecutionStatus {
	planPath: string;
	startedAt: string;
	attempt: number;
	completedSections: number[];
	failedSections: number[];
	checkerOutput: string;
	passed: boolean;
}

function statusPath(cwd: string, planPath: string): string {
	const planName = path.basename(planPath, ".md");
	return path.join(cwd, ".pi", `STATUS-${planName}.md`);
}

function writeStatus(cwd: string, planPath: string, status: ExecutionStatus): void {
	const filePath = statusPath(cwd, planPath);
	const dir = path.dirname(filePath);
	if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

	const content = `# Execution Status: ${path.basename(planPath)}

**Started:** ${status.startedAt}
**Attempt:** ${status.attempt}/${MAX_ATTEMPTS}
**Passed:** ${status.passed ? "✅ Yes" : "❌ No"}

## Completed Sections
${status.completedSections.map(i => `- [x] Section ${i}`).join("\n") || "None yet"}

## Failed Sections
${status.failedSections.map(i => `- [ ] Section ${i}`).join("\n") || "None"}

## Last Checker Output
\`\`\`
${status.checkerOutput.slice(0, 3000)}
\`\`\`

<!-- JSON_STATUS
${JSON.stringify(status)}
-->
`;
	fs.writeFileSync(filePath, content, "utf-8");
}

function readStatus(cwd: string, planPath: string): ExecutionStatus | null {
	const filePath = statusPath(cwd, planPath);
	if (!fs.existsSync(filePath)) return null;

	try {
		const content = fs.readFileSync(filePath, "utf-8");
		const match = content.match(/<!-- JSON_STATUS\n([\s\S]*?)\n-->/);
		if (match) return JSON.parse(match[1]);
	} catch { /* ignore */ }
	return null;
}

function clearStatus(cwd: string, planPath: string): void {
	const filePath = statusPath(cwd, planPath);
	if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
}

// ── Extension ───────────────────────────────────────────────────────

export function init(pi: ExtensionAPI, isEnabled: () => boolean) {
	let currentCtx: ExtensionContext | undefined;

	pi.on("session_start", async (_ev, ctx) => { currentCtx = ctx; });

	// ── Live widget state ───────────────────────────────────────────
	const agents: Record<string, { status: "running" | "done" | "error"; activity: string; startTime: number }> = {};
	let widgetPhase = "";
	let phaseStart = 0;
	let timerHandle: ReturnType<typeof setInterval> | undefined;

	function updateWidget() {
		if (!currentCtx || !isEnabled()) return;
		currentCtx.ui.setWidget("executor", (_tui, theme) => ({
			render(width: number): string[] {
				const border = theme.fg("border", "─".repeat(width));
				const elapsed = ((Date.now() - phaseStart) / 1000).toFixed(0);
				const header = theme.fg("accent", theme.bold(" 🔨 Executor"))
					+ theme.fg("dim", ` — ${widgetPhase}`)
					+ theme.fg("dim", ` (${elapsed}s)`);
				const lines = [border, truncateToWidth(header, width)];

				for (const [label, state] of Object.entries(agents)) {
					const icon = state.status === "done" ? theme.fg("success", "✓")
						: state.status === "error" ? theme.fg("error", "✗")
						: theme.fg("warning", "●");
					const sec = ((Date.now() - state.startTime) / 1000).toFixed(0);
					const activity = state.activity ? theme.fg("muted", `  ${state.activity}`) : "";
					lines.push(truncateToWidth(` ${icon} ${theme.fg("accent", label)} ${theme.fg("dim", sec + "s")}${activity}`, width));
				}

				lines.push(border);
				return lines;
			},
			invalidate() {},
			dispose() {},
		}), { placement: "aboveEditor" });
	}

	function clearWidget() {
		if (timerHandle) { clearInterval(timerHandle); timerHandle = undefined; }
		currentCtx?.ui.setWidget("executor", undefined);
	}

	function startTimer() {
		if (timerHandle) clearInterval(timerHandle);
		if (currentCtx) {
			timerHandle = setInterval(() => updateWidget(), 1000);
			if (timerHandle && typeof timerHandle === "object" && "unref" in timerHandle) {
				(timerHandle as any).unref();
			}
		}
	}

	function setAgent(name: string, status: "running" | "done" | "error", activity: string) {
		if (!agents[name]) agents[name] = { status, activity, startTime: Date.now() };
		else { agents[name].status = status; agents[name].activity = activity; }
		updateWidget();
	}

	function resetAgents() {
		for (const key of Object.keys(agents)) delete agents[key];
	}

	async function executePlan(
		planContent: string, planPath: string, cwd: string, signal: AbortSignal | undefined,
		onUpdate?: (partial: any) => void,
	): Promise<string> {
		phaseStart = Date.now();
		resetAgents();
		startTimer();

		const sections = splitPlan(planContent);
		const planSummary = planContent.length > 4000
			? planContent.slice(0, 4000) + "\n\n... (plan truncated)"
			: planContent;

		// ── Check for resumable status ──
		const prevStatus = readStatus(cwd, planPath);
		let startAttempt = 1;
		let completedIndices = new Set<number>();
		let prevCheckerOutput = "";

		if (prevStatus && !prevStatus.passed && prevStatus.attempt < MAX_ATTEMPTS) {
			startAttempt = prevStatus.attempt + 1;
			completedIndices = new Set(prevStatus.completedSections);
			prevCheckerOutput = prevStatus.checkerOutput;
			onUpdate?.({ content: [{ type: "text", text: `♻️ Resuming from attempt ${prevStatus.attempt} — ${completedIndices.size}/${sections.length} sections done` }] });
		}

		// ── Analyze dependencies and build waves ──
		let waves: PlanSection[][];

		if (sections.length <= 1) {
			waves = [sections];
		} else {
			widgetPhase = "analyzing dependencies";
			setAgent("analyzer", "running", "determining section dependencies...");
			updateWidget();
			onUpdate?.({ content: [{ type: "text", text: `🔍 Analyzing dependencies for ${sections.length} sections...` }] });

			const dag = await analyzeDependencies(sections, cwd, signal);
			waves = buildWaves(sections, dag);

			setAgent("analyzer", "done", `${waves.length} waves planned`);
			onUpdate?.({ content: [{ type: "text", text: `📊 DAG: ${sections.length} sections → ${waves.length} waves (${waves.map(w => w.length).join(", ")} per wave)` }] });
		}

		let attempt = startAttempt;
		let builderOutput = "";
		let checkerOutput = prevCheckerOutput;
		let passed = false;

		while (attempt <= MAX_ATTEMPTS && !passed) {
			widgetPhase = `attempt ${attempt}/${MAX_ATTEMPTS}`;
			resetAgents();

			if (attempt === startAttempt && completedIndices.size === 0) {
				// ── Fresh execution: run waves ──
				const waveOutputs: string[] = [];

				for (let wi = 0; wi < waves.length; wi++) {
					const wave = waves[wi];
					// Filter out already completed sections (resume case)
					const pending = wave.filter(s => !completedIndices.has(s.index));
					if (pending.length === 0) continue;

					widgetPhase = `wave ${wi + 1}/${waves.length} (attempt ${attempt}/${MAX_ATTEMPTS})`;
					onUpdate?.({ content: [{ type: "text", text: `🌊 Wave ${wi + 1}/${waves.length}: ${pending.length} section${pending.length > 1 ? "s" : ""} in parallel` }] });

					const builders: Promise<{ output: string; exitCode: number; section: PlanSection }>[] = [];

					for (let i = 0; i < pending.length; i++) {
						const sec = pending[i];
						const label = `builder-${sec.index + 1}`;
						setAgent(label, "running", sec.title.slice(0, 40));

						if (i > 0) await new Promise(r => setTimeout(r, 500)); // Stagger slightly

						builders.push(
							runAgent({
								cwd,
								model: BUILDER_MODEL,
								systemPrompt: BUILDER_PROMPT,
								tools: "read,write,edit,bash,grep,find,ls",
								task: `Implement this section of the plan:\n\n## Context (plan overview)\n${planSummary.slice(0, 2000)}\n\n## Your Section\n${sec.content}`,
								signal,
								onActivity: (activity) => { setAgent(label, "running", activity); },
							}).then(result => {
								setAgent(label, result.exitCode === 0 ? "done" : "error",
									result.exitCode === 0 ? "complete" : "failed");
								if (result.exitCode === 0) completedIndices.add(sec.index);
								return { ...result, section: sec };
							})
						);
					}

					const results = await Promise.all(builders);
					for (const r of results) {
						waveOutputs.push(`### Section ${r.section.index + 1}: ${r.section.title}\n${r.output.slice(0, 1500)}`);
					}

					// Update status after each wave
					writeStatus(cwd, planPath, {
						planPath,
						startedAt: new Date(phaseStart).toISOString(),
						attempt,
						completedSections: Array.from(completedIndices),
						failedSections: sections.filter(s => !completedIndices.has(s.index)).map(s => s.index),
						checkerOutput: "",
						passed: false,
					});
				}

				builderOutput = waveOutputs.join("\n\n");
			} else {
				// ── Retry: sequential build with failure context ──
				widgetPhase = `retry build (attempt ${attempt}/${MAX_ATTEMPTS})`;
				setAgent("builder", "running", "fixing failures...");
				updateWidget();
				onUpdate?.({ content: [{ type: "text", text: `🔧 Retry build attempt ${attempt}/${MAX_ATTEMPTS}...` }] });

				const build = await runAgent({
					cwd,
					model: BUILDER_MODEL,
					systemPrompt: BUILDER_PROMPT,
					tools: "read,write,edit,bash,grep,find,ls",
					task: `The previous implementation had test/lint failures. Fix them:\n\n## Failures to Fix\n${checkerOutput.slice(0, 3000)}\n\n## Plan Reference (for context only)\n${planSummary}`,
					signal,
					onActivity: (activity) => { setAgent("builder", "running", activity); },
				});
				builderOutput = build.output;
				setAgent("builder", build.exitCode === 0 ? "done" : "error",
					build.exitCode === 0 ? "complete" : "failed");

				if (build.exitCode !== 0 && attempt >= MAX_ATTEMPTS) break;
				if (build.exitCode !== 0) { attempt++; continue; }
			}

			// ── Check ──
			widgetPhase = `checking (attempt ${attempt}/${MAX_ATTEMPTS})`;
			setAgent("checker", "running", "starting...");
			updateWidget();
			onUpdate?.({ content: [{ type: "text", text: `🔍 Checking attempt ${attempt}...` }] });

			const check = await runAgent({
				cwd,
				model: CHECKER_MODEL,
				systemPrompt: CHECKER_PROMPT,
				tools: "read,bash,grep,find,ls",
				task: `Run tests, type-check, and lint for this project. Report PASS or FAIL with details.\n\nBuilder's summary of what changed:\n${builderOutput.slice(0, 2000)}`,
				signal,
				onActivity: (activity) => { setAgent("checker", "running", activity); },
			});
			checkerOutput = check.output;

			passed = !checkerOutput.toLowerCase().includes("fail");
			setAgent("checker", passed ? "done" : "error", passed ? "all passed" : "failures found");

			// Update status
			writeStatus(cwd, planPath, {
				planPath,
				startedAt: new Date(phaseStart).toISOString(),
				attempt,
				completedSections: Array.from(completedIndices),
				failedSections: [],
				checkerOutput,
				passed,
			});

			if (passed) {
				onUpdate?.({ content: [{ type: "text", text: `✅ Checks passed on attempt ${attempt}` }] });
				clearStatus(cwd, planPath);
			} else {
				onUpdate?.({ content: [{ type: "text", text: `❌ Checks failed (attempt ${attempt}/${MAX_ATTEMPTS})` }] });
				resetAgents();
			}

			attempt++;
		}

		const t = setTimeout(() => clearWidget(), 3000);
		if (t && typeof t === "object" && "unref" in t) (t as any).unref();

		const totalSections = sections.length;
		const waveInfo = waves.length > 1 ? `\n**Waves:** ${waves.length} (${waves.map(w => w.length).join(" → ")})` : "";
		const status = passed ? "✅ All checks passed" : `⚠️ Checks still failing after ${MAX_ATTEMPTS} attempts`;
		return `## Execution Summary\n\n**Status:** ${status}\n**Attempts:** ${attempt - 1}\n**Sections:** ${totalSections}${waveInfo}\n**Plan:** ${planPath}\n\n### Builder Output\n${builderOutput.slice(0, 5000)}\n\n### Checker Report\n${checkerOutput.slice(0, 3000)}`;
	}

	// ── /execute command ────────────────────────────────────────────

	pi.registerCommand("execute", {
		description: "Execute a plan: /execute <plan-file-path>",
		handler: async (args, ctx) => {
			let planPath = args.trim();
			if (!planPath) {
				const planDir = path.join(ctx.cwd, "docs", "plans");
				if (fs.existsSync(planDir)) {
					const files = fs.readdirSync(planDir).filter(f => f.endsWith(".md")).sort().reverse();
					if (files.length) {
						planPath = path.join("docs", "plans", files[0]);
						ctx.ui.notify(`Using latest plan: ${planPath}`, "info");
					}
				}
				if (!planPath) {
					ctx.ui.notify("Usage: /execute <plan-file> or create a plan first with /plan", "warning");
					return;
				}
			}

			const fullPath = path.resolve(ctx.cwd, planPath);
			if (!fs.existsSync(fullPath)) {
				ctx.ui.notify(`Plan not found: ${planPath}`, "error");
				return;
			}

			const planContent = fs.readFileSync(fullPath, "utf-8");
			const summary = await executePlan(planContent, planPath, ctx.cwd, undefined);

			pi.sendUserMessage(summary);
		},
	});

	// ── execute_plan tool ───────────────────────────────────────────

	pi.registerTool({
		name: "execute_plan",
		label: "Execute Plan",
		description: "Execute a plan file with DAG-scheduled parallel waves. Splits plan into sections, analyzes dependencies, runs independent sections in parallel. Progress saved to STATUS.md for resume.",
		parameters: Type.Object({
			plan_file: Type.String({ description: "Path to the plan .md file" }),
		}),
		async execute(_id, params, signal, onUpdate, ctx) {
			const fullPath = path.resolve(ctx.cwd, params.plan_file);
			if (!fs.existsSync(fullPath)) {
				return { content: [{ type: "text", text: `Plan not found: ${params.plan_file}` }], details: {} };
			}

			const planContent = fs.readFileSync(fullPath, "utf-8");
			const summary = await executePlan(planContent, params.plan_file, ctx.cwd, signal, onUpdate);

			return { content: [{ type: "text", text: summary }], details: {} };
		},
		renderCall(args, theme) {
			return new Text(theme.fg("toolTitle", theme.bold("execute_plan ")) + theme.fg("accent", args.plan_file || "?"), 0, 0);
		},
		renderResult(result, _opts, theme) {
			const text = result.content[0]?.type === "text" ? result.content[0].text : "";
			const passed = text.includes("✅");
			return new Text(
				passed ? theme.fg("success", "✓ Execution complete — all checks passed")
					: theme.fg("warning", "⚠ Execution complete — see details"),
				0, 0,
			);
		},
	});
}
