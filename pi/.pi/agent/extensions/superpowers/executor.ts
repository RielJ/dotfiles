/**
 * Executor — Plan execution with builder + checker subagents
 *
 * /execute [plan-file] spawns:
 *   1. Builder subagent(s) — implement the plan (parallel for big plans)
 *   2. Checker subagent — runs tests, lint, type-check
 *   3. If checks fail, loops (max 3 attempts)
 *
 * Live widget shows what each subagent is doing in real-time.
 */

import type { ExtensionAPI, ExtensionContext } from "@mariozechner/pi-coding-agent";
import { Text, truncateToWidth } from "@mariozechner/pi-tui";
import { Type } from "@sinclair/typebox";
import { spawn } from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

// ── Module Metadata ─────────────────────────────────────────────────

export const module = {
	id: "executor",
	name: "Plan Executor",
	description: "Execute plans with builder + checker subagents, live activity tracking",
	systemPromptWhenEnabled: `### Plan Executor
Use /execute <plan-file> or the execute_plan tool to execute a plan:
1. Builder subagent implements the plan (with full codebase tools)
2. Checker subagent runs tests, lint, type-check to verify
3. If checks fail, builder gets feedback and retries (max 3 attempts)
4. For large plans with independent sections, builders run in parallel

Plans are markdown files, typically in docs/plans/.`,
};

// ── Config ──────────────────────────────────────────────────────────

const BUILDER_MODEL = "anthropic/claude-sonnet-4-6";
const CHECKER_MODEL = "anthropic/claude-sonnet-4-6";
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
4. Check for obvious issues: unused imports, TODO/FIXME left behind, console.logs

Report PASS or FAIL.
If FAIL, list every failing check with:
- The exact error output
- Which file/line is affected
- A suggested fix

Be strict. Any test failure or type error is a FAIL.`;

// ── Subagent Runner with Activity Tracking ──────────────────────────

type ActivityCallback = (activity: string) => void;

function runAgent(
	cwd: string, model: string, systemPrompt: string, tools: string,
	task: string, signal?: AbortSignal, onActivity?: ActivityCallback,
): Promise<{ output: string; exitCode: number }> {
	return new Promise((resolve) => {
		const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "pi-exec-"));
		const promptFile = path.join(tmpDir, "prompt.md");
		fs.writeFileSync(promptFile, systemPrompt, "utf-8");

		const args = [
			"--mode", "json", "-p", "--no-session", "--no-extensions",
			"--model", model,
			"--tools", tools,
			"--append-system-prompt", promptFile,
			task,
		];

		const proc = spawn("pi", args, { cwd, stdio: ["ignore", "pipe", "pipe"] });
		const chunks: string[] = [];
		let buffer = "";
		let stderrBuf = "";
		let textLen = 0;
		let lastTool = "";

		function processLine(line: string) {
			if (!line.trim()) return;
			try {
				const ev = JSON.parse(line);
				const t = ev.type;

				// Track activity
				if (onActivity) {
					if (t === "message_update") {
						const ae = ev.assistantMessageEvent;
						if (ae?.type === "thinking_start") onActivity("thinking...");
						else if (ae?.type === "text_start") onActivity("writing summary...");
						else if (ae?.type === "text_delta") {
							textLen += (ae.delta || "").length;
							onActivity(`writing... ${(textLen / 1024).toFixed(1)}k`);
						}
						else if (ae?.type === "toolcall_start") {
							const name = ae.toolCall?.name || "tool";
							lastTool = name;
							onActivity(`preparing ${name}...`);
						}
					} else if (t === "tool_call_start") {
						const tc = ev.toolCall || {};
						const name = tc.name || "tool";
						const a = tc.arguments || {};
						lastTool = name;
						// Build a meaningful description
						let detail = "";
						if (name === "edit" && a.path) detail = path.basename(a.path);
						else if (name === "write" && a.path) detail = path.basename(a.path);
						else if (name === "read" && a.path) detail = path.basename(a.path);
						else if (name === "bash" && a.command) detail = a.command.slice(0, 40);
						else if (name === "grep" && a.pattern) detail = a.pattern;
						else if (name === "find" && a.pattern) detail = a.pattern;
						else if (a.path) detail = path.basename(a.path);
						onActivity(`${name}${detail ? ` ${detail}` : ""}`);
					} else if (t === "tool_execution_start") {
						onActivity(`running ${lastTool}...`);
					} else if (t === "tool_execution_end") {
						const isErr = ev.result?.isError;
						if (isErr) onActivity(`${lastTool} ✗ error`);
					}
				}

				// Capture final text output
				if (t === "message_end" && ev.message?.role === "assistant") {
					for (const part of ev.message.content) {
						if (part.type === "text") chunks.push(part.text);
					}
				}
			} catch {}
		}

		proc.stdout!.setEncoding("utf-8");
		proc.stdout!.on("data", (chunk: string) => {
			buffer += chunk;
			const lines = buffer.split("\n");
			buffer = lines.pop() || "";
			for (const line of lines) processLine(line);
		});

		proc.stderr!.setEncoding("utf-8");
		proc.stderr!.on("data", (chunk: string) => { stderrBuf += chunk; });

		proc.on("close", (code) => {
			// Flush remaining buffer
			if (buffer.trim()) processLine(buffer);
			try { fs.unlinkSync(promptFile); } catch {}
			try { fs.rmdirSync(tmpDir); } catch {}
			const output = chunks.join("\n");
			if (!output && stderrBuf.trim()) {
				resolve({ output: `(stderr: ${stderrBuf.trim().slice(0, 200)})`, exitCode: code ?? 1 });
			} else {
				resolve({ output, exitCode: code ?? 1 });
			}
		});

		proc.on("error", (err) => {
			try { fs.unlinkSync(promptFile); } catch {}
			try { fs.rmdirSync(tmpDir); } catch {}
			resolve({ output: `Error: ${err.message}`, exitCode: 1 });
		});

		if (signal) {
			const kill = () => proc.kill("SIGTERM");
			if (signal.aborted) kill();
			else signal.addEventListener("abort", kill, { once: true });
		}
	});
}

// ── Plan Splitter ───────────────────────────────────────────────────

interface PlanSection {
	title: string;
	content: string;
}

/**
 * Split a plan into independent sections that can be parallelized.
 * Only splits on ## headings that look like independent task groups.
 * Returns multiple sections only if the plan is big enough to warrant it.
 */
function splitPlan(planContent: string): PlanSection[] {
	const lines = planContent.split("\n");
	const sections: PlanSection[] = [];
	let current: { title: string; lines: string[] } | null = null;

	for (const line of lines) {
		const match = line.match(/^##\s+(?:Task|Step|Phase|Part|Section)\s*\d*[:.—-]\s*(.*)/i);
		if (match) {
			if (current) sections.push({ title: current.title, content: current.lines.join("\n") });
			current = { title: match[1] || line.replace(/^##\s*/, ""), lines: [line] };
		} else if (current) {
			current.lines.push(line);
		} else {
			// Preamble before first section — keep for context
			if (!sections.length) {
				if (!current) current = { title: "Plan", lines: [] };
				current.lines.push(line);
			}
		}
	}
	if (current) sections.push({ title: current.title, content: current.lines.join("\n") });

	// Only parallelize if we have 2+ substantial sections (>200 chars each)
	const substantial = sections.filter(s => s.content.length > 200);
	if (substantial.length < 2) return [{ title: "Full Plan", content: planContent }];

	return sections;
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
		const isParallel = sections.length > 1;
		let attempt = 0;
		let builderOutput = "";
		let checkerOutput = "";
		let passed = false;

		while (attempt < MAX_ATTEMPTS && !passed) {
			attempt++;
			widgetPhase = `attempt ${attempt}/${MAX_ATTEMPTS}`;

			if (isParallel && attempt === 1) {
				// ── Parallel build for independent sections ──
				widgetPhase = `parallel build (attempt ${attempt}/${MAX_ATTEMPTS}) — ${sections.length} sections`;
				updateWidget();
				onUpdate?.({ content: [{ type: "text", text: `⚡ Building ${sections.length} sections in parallel...` }] });

				const builders: Promise<{ output: string; exitCode: number }>[] = [];
				for (let i = 0; i < sections.length; i++) {
					const sec = sections[i];
					const label = `builder-${i + 1}`;
					setAgent(label, "running", sec.title.slice(0, 40));

					// Stagger by 1s to avoid lock file conflict
					if (i > 0) await new Promise(r => setTimeout(r, 1000));

					builders.push(
						runAgent(cwd, BUILDER_MODEL, BUILDER_PROMPT,
							"read,write,edit,bash,grep,find,ls",
							`Implement this section of the plan:\n\n## Context (full plan)\n${planContent.slice(0, 2000)}\n\n## Your Section\n${sec.content}`,
							signal,
							(activity) => { setAgent(label, "running", activity); },
						).then(result => {
							setAgent(label, result.exitCode === 0 ? "done" : "error",
								result.exitCode === 0 ? "complete" : "failed");
							return result;
						})
					);
				}

				const results = await Promise.all(builders);
				builderOutput = results.map((r, i) =>
					`### Section ${i + 1}: ${sections[i].title}\n${r.output.slice(0, 2000)}`
				).join("\n\n");
			} else {
				// ── Sequential build (single builder or retry) ──
				const buildTask = attempt === 1
					? `Implement this plan:\n\n${planContent}`
					: `The previous implementation had issues. Fix them:\n\n## Checker Feedback\n${checkerOutput}\n\n## Original Plan\n${planContent}`;

				widgetPhase = `build (attempt ${attempt}/${MAX_ATTEMPTS})`;
				setAgent("builder", "running", "starting...");
				updateWidget();
				onUpdate?.({ content: [{ type: "text", text: `⚡ Build attempt ${attempt}/${MAX_ATTEMPTS}...` }] });

				const build = await runAgent(cwd, BUILDER_MODEL, BUILDER_PROMPT,
					"read,write,edit,bash,grep,find,ls", buildTask, signal,
					(activity) => { setAgent("builder", "running", activity); },
				);
				builderOutput = build.output;
				setAgent("builder", build.exitCode === 0 ? "done" : "error",
					build.exitCode === 0 ? "complete" : "failed");

				if (build.exitCode !== 0 && attempt >= MAX_ATTEMPTS) break;
				if (build.exitCode !== 0) continue;
			}

			// ── Check ──
			widgetPhase = `checking (attempt ${attempt}/${MAX_ATTEMPTS})`;
			setAgent("checker", "running", "starting...");
			updateWidget();
			onUpdate?.({ content: [{ type: "text", text: `🔍 Checking attempt ${attempt}...` }] });

			const check = await runAgent(cwd, CHECKER_MODEL, CHECKER_PROMPT,
				"read,bash,grep,find,ls",
				`Verify the implementation of this plan:\n\n${planContent}\n\nBuilder's summary:\n${builderOutput.slice(0, 3000)}`,
				signal,
				(activity) => { setAgent("checker", "running", activity); },
			);
			checkerOutput = check.output;

			passed = !checkerOutput.toLowerCase().includes("fail");
			setAgent("checker", passed ? "done" : "error", passed ? "all passed" : "failures found");

			if (passed) {
				onUpdate?.({ content: [{ type: "text", text: `✅ Checks passed on attempt ${attempt}` }] });
			} else {
				onUpdate?.({ content: [{ type: "text", text: `❌ Checks failed (attempt ${attempt}/${MAX_ATTEMPTS})` }] });
				// Clean up parallel builder entries for retry (goes sequential)
				resetAgents();
			}
		}

		// Clean up
		const t = setTimeout(() => clearWidget(), 3000);
		if (t && typeof t === "object" && "unref" in t) (t as any).unref();

		const status = passed ? "✅ All checks passed" : `⚠️ Checks still failing after ${MAX_ATTEMPTS} attempts`;
		return `## Execution Summary\n\n**Status:** ${status}\n**Attempts:** ${attempt}${isParallel ? `\n**Sections:** ${sections.length} (parallel)` : ""}\n**Plan:** ${planPath}\n\n### Builder Output\n${builderOutput.slice(0, 5000)}\n\n### Checker Report\n${checkerOutput.slice(0, 3000)}`;
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
		description: "Execute a plan file with builder + checker subagents. Shows live progress. For large plans with independent sections, builders run in parallel.",
		parameters: Type.Object({
			plan_file: Type.String({ description: "Path to the plan .md file" }),
		}),
		async execute(_id, params, signal, onUpdate, ctx) {
			const fullPath = path.resolve(ctx.cwd, params.plan_file);
			if (!fs.existsSync(fullPath)) {
				return { content: [{ type: "text", text: `Plan not found: ${params.plan_file}` }] };
			}

			const planContent = fs.readFileSync(fullPath, "utf-8");
			const summary = await executePlan(planContent, params.plan_file, ctx.cwd, signal, onUpdate);

			return { content: [{ type: "text", text: summary }] };
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
