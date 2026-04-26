/**
 * Shared subagent runner for superpowers
 *
 * All superpowers (executor, planner, reviewer) spawn pi subagents.
 * This module centralizes the spawning logic so token-saving fixes
 * (extensions, model config) only need to change in one place.
 *
 * Architecture:
 * - Phase 0: Sonnet explorer with gitnexus + code-review-graph (cheap, shared)
 * - Phase 1: Opus + GPT planners/reviewers (parallel, both get Phase 0 output)
 * - Subagents run with --no-extensions + selective whitelist
 */

import { execSync, spawn } from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import type { ExtensionContext } from "@mariozechner/pi-coding-agent";

// ── Models ──────────────────────────────────────────────────────────

export const MODELS = {
	/** For implementation — Opus for strongest coding output */
	build: "anthropic/claude-opus-4-6",
	/** For Phase 0 exploration — Sonnet is fast, cheap, follows instructions well */
	explore: "anthropic/claude-sonnet-4-6",
	/** For planning and review writing — strongest reasoning */
	plan: "anthropic/claude-opus-4-6",
	/** For checking (tests, lint, type-check) — Sonnet catches issues Haiku misses */
	check: "anthropic/claude-sonnet-4-6",
	/** For second-opinion diversity (different provider) */
	diversity: "openai-codex/gpt-5.5",
} as const;

// ── Task Context Resolution (Pre-Phase) ─────────────────────────────

/**
 * Resolve external references in a task description before exploration.
 *
 * Detects and fetches:
 *   - GitHub issues:  #151, issue #151, GH-151, github.com/.../issues/151
 *   - GitHub PRs:     PR #42, pull #42, github.com/.../pull/42
 *   - URLs:           https://... (fetched and converted to markdown)
 *
 * Returns the original task enriched with fetched context.
 * All fetches are best-effort — failures are silently skipped.
 */
export async function resolveTaskContext(
	cwd: string,
	task: string,
): Promise<{ resolvedTask: string; references: string[] }> {
	const references: string[] = [];
	const contextParts: string[] = [];

	// ── GitHub Issues: #151, issue #151, issue#151, GH-151 ──
	const issuePatterns = [
		/(?:github\s+)?issue\s*#?(\d+)/gi,
		/(?:^|\s)#(\d+)(?:\s|$)/g,
		/GH-(\d+)/gi,
		/github\.com\/[^/]+\/[^/]+\/issues\/(\d+)/gi,
	];

	const issueNums = new Set<string>();
	for (const pattern of issuePatterns) {
		let match: RegExpExecArray | null;
		while ((match = pattern.exec(task)) !== null) {
			issueNums.add(match[1]);
		}
	}

	for (const num of issueNums) {
		try {
			const result = execSync(
				`gh issue view ${num} --json title,body,labels,state,comments`,
				{ cwd, encoding: "utf-8", timeout: 15_000, stdio: ["ignore", "pipe", "ignore"] },
			).trim();
			if (result) {
				const issue = JSON.parse(result);
				const labels = (issue.labels || []).map((l: any) => l.name).join(", ");
				const comments = (issue.comments || [])
					.slice(-5) // last 5 comments
					.map((c: any) => `**${c.author?.login || "unknown"}**: ${(c.body || "").slice(0, 500)}`)
					.join("\n\n");

				let issueContext = `### GitHub Issue #${num}: ${issue.title || "Untitled"}\n`;
				issueContext += `**State:** ${issue.state || "unknown"}`;
				if (labels) issueContext += ` · **Labels:** ${labels}`;
				issueContext += `\n\n${(issue.body || "(no description)").slice(0, 3000)}`;
				if (comments) issueContext += `\n\n#### Recent Comments\n${comments.slice(0, 2000)}`;

				contextParts.push(issueContext);
				references.push(`issue #${num}`);
			}
		} catch {
			// gh CLI not available or issue not found — skip
		}
	}

	// ── GitHub PRs: PR #42, pull #42, github.com/.../pull/42 ──
	const prPatterns = [
		/(?:PR|pull)\s*#?(\d+)/gi,
		/github\.com\/[^/]+\/[^/]+\/pull\/(\d+)/gi,
	];

	const prNums = new Set<string>();
	for (const pattern of prPatterns) {
		let match: RegExpExecArray | null;
		while ((match = pattern.exec(task)) !== null) {
			// Avoid treating the same number as both issue and PR
			if (!issueNums.has(match[1])) {
				prNums.add(match[1]);
			}
		}
	}

	for (const num of prNums) {
		try {
			const result = execSync(
				`gh pr view ${num} --json title,body,labels,state,files,commits`,
				{ cwd, encoding: "utf-8", timeout: 15_000, stdio: ["ignore", "pipe", "ignore"] },
			).trim();
			if (result) {
				const pr = JSON.parse(result);
				const labels = (pr.labels || []).map((l: any) => l.name).join(", ");
				const files = (pr.files || []).map((f: any) => f.path).join("\n  ");

				let prContext = `### GitHub PR #${num}: ${pr.title || "Untitled"}\n`;
				prContext += `**State:** ${pr.state || "unknown"}`;
				if (labels) prContext += ` · **Labels:** ${labels}`;
				prContext += `\n\n${(pr.body || "(no description)").slice(0, 3000)}`;
				if (files) prContext += `\n\n#### Changed Files\n  ${files.slice(0, 1000)}`;

				contextParts.push(prContext);
				references.push(`PR #${num}`);
			}
		} catch {
			// gh CLI not available or PR not found — skip
		}
	}

	// ── URLs: fetch and convert to markdown ──
	const urlPattern = /https?:\/\/[^\s)>"]+/gi;
	let urlMatch: RegExpExecArray | null;
	const seenUrls = new Set<string>();

	while ((urlMatch = urlPattern.exec(task)) !== null) {
		const url = urlMatch[0].replace(/[.,;:!?]+$/, ""); // strip trailing punctuation
		// Skip GitHub issue/PR URLs (already handled above)
		if (/github\.com\/[^/]+\/[^/]+\/(issues|pull)\/\d+/.test(url)) continue;
		if (seenUrls.has(url)) continue;
		seenUrls.add(url);

		try {
			const content = execSync(
				`curl -sL --max-time 10 "${url}" | head -c 5000`,
				{ encoding: "utf-8", timeout: 15_000, stdio: ["ignore", "pipe", "ignore"] },
			).trim();
			if (content && content.length > 50) {
				contextParts.push(`### Reference: ${url}\n\n${content.slice(0, 3000)}`);
				references.push(url);
			}
		} catch {
			// URL fetch failed — skip
		}
	}

	// ── Build resolved task ──
	if (contextParts.length === 0) {
		return { resolvedTask: task, references };
	}

	const resolved = `## External References\n\n${contextParts.join("\n\n---\n\n")}\n\n## Original Task\n\n${task}`;
	return { resolvedTask: resolved, references };
}

// ── Extension Whitelisting ──────────────────────────────────────────

/**
 * Extension paths that provide material benefit to subagents.
 * Resolved once per session and cached.
 */
const EXTENSION_PATHS = {
	/** pi-fff: SIMD-accelerated grep/find with frecency ranking */
	piFff: path.join(os.homedir(), ".pi/agent/git/github.com/SamuelLHuber/pi-fff/src/index.ts"),
	/** condensed-milk: semantic compression of bash output (token savings) */
	condensedMilk: (() => {
		try {
			const npmRoot = execSync("npm root -g", { encoding: "utf-8", timeout: 5_000 }).trim();
			return path.join(npmRoot, "@tomooshi/condensed-milk-pi/index.ts");
		} catch {
			return "";
		}
	})(),
	/** gitnexus: knowledge graph with execution flows, symbol context, blast radius */
	gitnexus: path.join(os.homedir(), ".pi/agent/git/github.com/tintinweb/pi-gitnexus/src/index.ts"),
} as const;

function buildExtensionArgs(keys: (keyof typeof EXTENSION_PATHS)[]): string[] {
	const args: string[] = [];
	for (const key of keys) {
		const p = EXTENSION_PATHS[key];
		if (p && fs.existsSync(p)) {
			args.push("-e", p);
		}
	}
	return args;
}

// Phase 0 explorer: gitnexus (graph queries) + pi-fff (search) + condensed-milk (compression)
let _phase0ExtArgs: string[] | undefined;
function phase0ExtensionArgs(): string[] {
	if (!_phase0ExtArgs) _phase0ExtArgs = buildExtensionArgs(["gitnexus", "piFff", "condensedMilk"]);
	return _phase0ExtArgs;
}

// Phase 1 planners/reviewers: pi-fff (search) + condensed-milk (compression) — NO gitnexus (they get its output from Phase 0)
let _phase1ExtArgs: string[] | undefined;
function phase1ExtensionArgs(): string[] {
	if (!_phase1ExtArgs) _phase1ExtArgs = buildExtensionArgs(["piFff", "condensedMilk"]);
	return _phase1ExtArgs;
}

// Executor builders/checkers: pi-fff + condensed-milk
export function executorExtensionArgs(): string[] {
	return phase1ExtensionArgs();
}

// ── Types ───────────────────────────────────────────────────────────

export type ActivityCallback = (activity: string) => void;

export interface AgentResult {
	output: string;
	exitCode: number;
}

export interface RunAgentOptions {
	/** Working directory */
	cwd: string;
	/** Model identifier (e.g. "anthropic/claude-sonnet-4-6") */
	model: string;
	/** System prompt content (written to a temp file) */
	systemPrompt: string;
	/** Comma-separated tool list (e.g. "read,write,edit,bash,grep,find,ls") */
	tools: string;
	/** The task/prompt to send to the subagent */
	task: string;
	/** Kill after this many ms (default: 360_000 = 6 min) */
	timeoutMs?: number;
	/** Thinking level override (off, minimal, low, medium, high) */
	thinking?: string;
	/** AbortSignal for cancellation */
	signal?: AbortSignal;
	/** Activity callback for live widget updates */
	onActivity?: ActivityCallback;
	/** Override extension args (default: phase1ExtensionArgs) */
	extensionArgs?: string[];
	/** Kill process after this many tool executions (default: unlimited) */
	maxToolCalls?: number;
}

// ── Subagent Runner ─────────────────────────────────────────────────

export function runAgent(opts: RunAgentOptions): Promise<AgentResult> {
	const {
		cwd,
		model,
		systemPrompt,
		tools,
		task,
		timeoutMs = 360_000,
		thinking,
		signal,
		onActivity,
		extensionArgs: extArgs,
		maxToolCalls,
	} = opts;

	// Default to phase 1 extensions unless overridden
	const resolvedExtArgs = extArgs ?? phase1ExtensionArgs();

	return new Promise((resolve) => {
		const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "pi-superpower-"));
		const promptFile = path.join(tmpDir, "prompt.md");
		fs.writeFileSync(promptFile, systemPrompt, "utf-8");

		const args = [
			"--mode", "json",
			"-p",
			"--no-session",
			// Isolation: block ALL auto-discovery, then whitelist useful extensions
			"--no-extensions",
			"--no-skills",
			"--no-context-files",
			"--no-prompt-templates",
			"--no-themes",
			// Selectively load whitelisted extensions
			...resolvedExtArgs,
			"--model", model,
			"--tools", tools,
			...(thinking ? ["--thinking", thinking] : []),
			"--append-system-prompt", promptFile,
			task,
		];

		let proc;
		try {
			proc = spawn("pi", args, { cwd, stdio: ["pipe", "pipe", "pipe"] });
			// Close stdin immediately — subagents don't read from it
			proc.stdin?.end();
		} catch (spawnErr: any) {
			try { fs.unlinkSync(promptFile); } catch {}
			try { fs.rmdirSync(tmpDir); } catch {}
			resolve({ output: `Spawn error: ${spawnErr.message}`, exitCode: 1 });
			return;
		}
		const chunks: string[] = [];
		let currentMsgText = ""; // accumulates text_delta for current message
		let buffer = "";
		let stderrBuf = "";
		let textLen = 0;
		let toolCount = 0;
		let turnCount = 0;
		let lastTool = "";
		let phase: "thinking" | "exploring" | "writing" = "thinking";

		function formatActivity(): string {
			const parts: string[] = [];
			if (phase === "thinking") parts.push("thinking");
			else if (phase === "exploring") parts.push("exploring");
			else if (phase === "writing") parts.push(`writing ${(textLen / 1024).toFixed(1)}k`);
			if (toolCount > 0) parts.push(`${toolCount} tools`);
			if (turnCount > 1) parts.push(`turn ${turnCount}`);
			return parts.join(" · ");
		}

		function processLine(line: string) {
			if (!line.trim()) return;
			try {
				const ev = JSON.parse(line);
				const t = ev.type;

				if (onActivity) {
					if (t === "message_update") {
						const ae = ev.assistantMessageEvent;
						if (ae?.type === "thinking_start") {
							phase = "thinking";
							onActivity(formatActivity());
						} else if (ae?.type === "text_start") {
							phase = "writing";
							onActivity(formatActivity());
						} else if (ae?.type === "text_delta") {
							const delta = ae.delta || "";
							textLen += delta.length;
							currentMsgText += delta;
							phase = "writing";
							onActivity(formatActivity());
						} else if (ae?.type === "toolcall_start") {
							const name = ae.toolCall?.name || "tool";
							lastTool = name;
							onActivity(`preparing ${name}...`);
						}
					} else if (t === "tool_call_start") {
						const tc = ev.toolCall || {};
						const name = tc.name || "tool";
						const a = tc.arguments || {};
						lastTool = name;
						let detail = "";
						if (name === "edit" && a.path) detail = path.basename(a.path);
						else if (name === "write" && a.path) detail = path.basename(a.path);
						else if (name === "read" && a.path) detail = path.basename(a.path);
						else if (name === "bash" && a.command) detail = a.command.slice(0, 40);
						else if (name === "grep" && a.pattern) detail = a.pattern;
						else if (name === "find" && a.pattern) detail = a.pattern;
						else if (name === "gitnexus_query" && a.query) detail = a.query.slice(0, 30);
						else if (name === "gitnexus_context" && a.name) detail = a.name;
						else if (a.path) detail = path.basename(a.path);
						onActivity(`${name}${detail ? ` ${detail}` : ""}`);
					} else if (t === "tool_execution_start") {
						toolCount++;
						phase = "exploring";
						onActivity(formatActivity());
					} else if (t === "tool_execution_end") {
						const isErr = ev.result?.isError;
						if (isErr) onActivity(`${lastTool} ✗ error`);
						// Enforce tool call limit: kill process after maxToolCalls
						if (maxToolCalls && toolCount >= maxToolCalls) {
							onActivity?.(`tool limit reached (${maxToolCalls}), finishing...`);
							try { proc.kill("SIGTERM"); } catch {}
						}
					} else if (t === "turn_start") {
						turnCount++;
						onActivity(formatActivity());
					}
				}

				// Capture text output from each assistant message
				if (t === "message_end" && ev.message?.role === "assistant") {
					for (const part of ev.message.content) {
						if (part.type === "text") chunks.push(part.text);
					}
					// Reset incremental text tracker for next message
					currentMsgText = "";
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

		// Auto-kill after timeout
		const killTimer = setTimeout(() => {
			try { proc.kill("SIGTERM"); } catch {}
		}, timeoutMs);
		if (typeof killTimer === "object" && "unref" in killTimer) (killTimer as any).unref();

		proc.on("close", (code) => {
			clearTimeout(killTimer);
			if (buffer.trim()) processLine(buffer);
			// If killed mid-message, capture whatever text was streaming
			if (currentMsgText.trim()) {
				chunks.push(currentMsgText);
			}
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
			clearTimeout(killTimer);
			try { fs.unlinkSync(promptFile); } catch {}
			try { fs.rmdirSync(tmpDir); } catch {}
			resolve({ output: `Error: ${err.message}`, exitCode: 1 });
		});

		if (signal) {
			const kill = () => { clearTimeout(killTimer); try { proc.kill("SIGTERM"); } catch {} };
			if (signal.aborted) kill();
			else signal.addEventListener("abort", kill, { once: true });
		}
	});
}

// ── Phase 0: Exploration ────────────────────────────────────────────

/**
 * Phase 0 exploration prompts.
 * The explorer gets gitnexus tools + code-review-graph (bash) + read/grep/find.
 */
const EXPLORE_FOR_PLANNING_PROMPT = `You are a codebase explorer preparing context for a planning agent.
Your job is to quickly understand the project and gather the information needed to write an implementation plan.

## Available Tools
You have access to:
- **gitnexus_query** — Search the knowledge graph for execution flows, symbols, and dependencies related to the task
- **gitnexus_context** — Get a 360° view of a specific symbol (callers, callees, related flows)
- **code-review-graph** — Run via bash: \`code-review-graph status\` for project structure
- **read/grep/find/ls** — Standard file exploration

## Workflow — BUDGET: ~12 tool calls, then STOP
Be efficient. Prioritize high-signal tools first:
1. \`gitnexus_query\` with keywords from the task (1-2 calls)
2. \`gitnexus_context\` on 1-2 key symbols if gitnexus worked (1-2 calls)
3. If gitnexus unavailable: \`bash\` \`code-review-graph status\` (1 call)
4. \`find\` or \`grep\` to locate relevant files (2-3 calls)
5. \`read\` to examine 3-4 key files (3-4 calls)
6. STOP and write your findings. Do NOT keep exploring endlessly.

Once you have a reasonable picture, output your findings immediately.

## Output Format
Your final message MUST be this structured format:

### Project Overview
- Tech stack, framework, languages
- Key directories and their purposes

### Relevant Code
For each relevant file found:
- **Path**: \`src/path/to/file.ts\`
- **Key exports**: functions, types, classes
- **Patterns**: how it's structured, conventions used

### Dependencies & Connections
- How the relevant pieces connect to each other
- Import chains, API contracts, shared types

### Key Observations for Planning
- Existing patterns the plan should follow
- Potential gotchas or constraints
- Testing patterns in use

Be concise. Focus on what a planner NEEDS to know to write a good plan.`;

const EXPLORE_FOR_REVIEW_PROMPT = `You are a codebase explorer preparing context for a code review agent.
Your job is to quickly understand the changes and their impact.

## Available Tools
You have access to:
- **gitnexus_query** — Search the knowledge graph for execution flows related to changes
- **gitnexus_context** — Get a 360° view of a symbol (callers, callees, related flows)
- **gitnexus_impact** — Blast radius analysis: what breaks if you change a symbol
- **code-review-graph** — Run via bash: \`code-review-graph detect-changes\` for impact analysis
- **read/grep/find/ls/bash** — Standard file exploration + git commands

## Workflow — BUDGET: ~12 tool calls, then STOP
Be efficient. Prioritize impact analysis first:
1. \`bash\`: \`git diff --stat\` to see what changed (1 call)
2. \`bash\`: \`code-review-graph detect-changes\` for blast radius (1 call)
3. \`gitnexus_impact\` on 1-2 key changed symbols (1-2 calls)
4. \`read\` the 3-4 most important changed files (3-4 calls)
5. \`grep\` for callers of changed functions (1-2 calls)
6. Check related test files (1-2 calls)
7. STOP and write your findings. Do NOT keep exploring endlessly.

Once you have a reasonable picture, output your findings immediately.

## Output Format
Your final message MUST be this structured format:

### Changed Files
For each changed file:
- **Path**: what changed (functions added/modified/removed)
- **Actual code** of key changed sections (abbreviated)

### Impact Analysis
- What depends on the changed code
- Callers of changed functions
- Downstream effects

### Test Coverage
- Which tests cover the changed code
- Are there gaps

### Context for Reviewer
- Related patterns in the codebase
- Conventions being followed or broken
- Risk areas to focus on

Be concise. Focus on what a reviewer NEEDS to know to write a thorough review.`;

export interface ExplorationOptions {
	/** Working directory */
	cwd: string;
	/** The task description to explore for */
	task: string;
	/** Whether exploring for planning or review */
	mode: "plan" | "review";
	/** Optional pre-gathered context (e.g., blast radius, git diff) */
	preContext?: string;
	/** Kill after this many ms (default: 60_000 = 60s) */
	timeoutMs?: number;
	/** AbortSignal for cancellation */
	signal?: AbortSignal;
	/** Activity callback for live widget updates */
	onActivity?: ActivityCallback;
}

/**
 * Phase 0: Run a Sonnet exploration agent with gitnexus + code-review-graph.
 *
 * Spawns a cheap, fast agent that uses graph tools to understand the codebase,
 * then outputs a structured context package for Phase 1 planners/reviewers.
 *
 * Returns the explorer's findings as a string (0-10KB).
 * Returns empty string if exploration fails (Phase 1 still works, just without the head start).
 */
export async function runExploration(opts: ExplorationOptions): Promise<string> {
	const {
		cwd,
		task,
		mode,
		preContext,
		timeoutMs = 60_000,
		signal,
		onActivity,
	} = opts;

	const prompt = mode === "plan"
		? EXPLORE_FOR_PLANNING_PROMPT
		: EXPLORE_FOR_REVIEW_PROMPT;

	let explorationTask = task;
	if (preContext) {
		explorationTask = `## Pre-gathered Context\n${preContext}\n\n## Task\n${task}`;
	}

	const result = await runAgent({
		cwd,
		model: MODELS.explore,
		systemPrompt: prompt,
		tools: "read,grep,find,ls,bash",
		task: explorationTask,
		timeoutMs,
		thinking: "off",
		signal,
		onActivity,
		// Phase 0 gets gitnexus for graph queries + pi-fff + condensed-milk
		extensionArgs: phase0ExtensionArgs(),
		// Hard limit: kill after 15 tool calls to prevent over-exploration
		maxToolCalls: 15,
	});

	// Accept output even if process was killed (timeout or maxToolCalls)
	// — the explorer may have produced useful partial findings
	if (!result.output?.trim()) {
		return "";
	}

	// Cap output to avoid bloating Phase 1 prompts
	const output = result.output.trim();
	if (output.length > 10_000) {
		return output.slice(0, 10_000) + "\n\n[...truncated to 10KB]";
	}
	return output;
}

// ── Conversation Context Extraction ─────────────────────────────────

/**
 * Extract recent conversation context for subagent enrichment.
 * Capped at 2000 chars to save tokens.
 */
export function extractConversationContext(
	ctx: ExtensionContext,
	maxChars = 2000,
): string {
	try {
		const entries = ctx.sessionManager.getBranch();
		const parts: string[] = [];
		let totalLen = 0;

		for (let i = entries.length - 1; i >= 0; i--) {
			const entry = entries[i] as any;
			if (entry.type !== "message") continue;
			const msg = entry.message;
			if (!msg) continue;

			let text = "";
			const role = msg.role;

			if (role === "user") {
				if (typeof msg.content === "string") {
					text = msg.content;
				} else if (Array.isArray(msg.content)) {
					text = msg.content
						.filter((c: any) => c.type === "text")
						.map((c: any) => c.text)
						.join("\n");
				}
				if (text) text = `User: ${text}`;
			} else if (role === "assistant") {
				if (Array.isArray(msg.content)) {
					text = msg.content
						.filter((c: any) => c.type === "text")
						.map((c: any) => c.text)
						.join("\n");
				}
				if (text) text = `Assistant: ${text}`;
			} else if (role === "compactionSummary") {
				text = `[Previous context summary]: ${typeof msg.content === "string" ? msg.content : ""}`;
			}

			if (!text) continue;
			if (text.length > 500) text = text.slice(0, 500) + "...";
			if (totalLen + text.length > maxChars) break;
			parts.unshift(text);
			totalLen += text.length;
		}

		return parts.join("\n\n");
	} catch {
		return "";
	}
}
