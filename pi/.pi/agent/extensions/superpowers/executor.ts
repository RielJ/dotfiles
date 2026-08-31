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
 *
 * DESIGN DECISION — in-house, NOT @tintinweb/pi-subagents:
 *   pi-subagents has a richer UX (FleetView, conversation viewer, steering) but loads
 *   3 tool schemas + a system prompt into the MAIN session on EVERY turn — a recurring
 *   context-token tax on the primary model, plus a behavioral cost (the model spawns
 *   agents proactively when the tool is visible). This executor instead registers ONE
 *   on-demand tool (execute_plan), runs builders as isolated `pi` subprocesses (zero
 *   main-context cost), and tees each subprocess NDJSON to a log file so /execute-log
 *   can show a drill-down transcript — logs are files, not messages, so the viewer
 *   re-enters NO context window. ~85% of the UX at ~0% of the always-on token cost.
 *   The pi-subagents RPC can't be cherry-picked without its always-on tools, and it
 *   targets @mariozechner/... vs this repo's @earendil-works/... (fork risk).
 */

import { execSync } from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";
import type {
  ExtensionAPI,
  ExtensionContext,
} from "@earendil-works/pi-coding-agent";
import {
  Key,
  matchesKey,
  Text,
  truncateToWidth,
  wrapTextWithAnsi,
} from "@earendil-works/pi-tui";
import { Type } from "@sinclair/typebox";
import { type AgentUsage, MODELS, runAgent } from "./_shared.js";

// ── Module Metadata ─────────────────────────────────────────────────

export const module = {
  id: "executor",
  name: "Plan Executor",
  description:
    "Execute plans with DAG-scheduled parallel waves, builder + checker subagents, and STATUS.md resume",
  systemPromptWhenEnabled: `### Plan Executor
Use /execute <plan-file> or the execute_plan tool to execute a plan:
1. Splits the plan into sections and analyzes dependencies
2. Builds a DAG and schedules sections into parallel waves
3. Independent sections run simultaneously as builder subagents
4. Checker subagent runs tests, lint, type-check after all waves complete
5. If checks fail, builder gets feedback and retries (max 3 attempts)
6. Progress is saved to STATUS.md — resume with /execute if interrupted

Live controls: /execute-stop [section|all] cancels a run, /execute-log [section] opens a
builder's transcript. The widget shows per-builder token usage and a running cost total.

Builders run as ISOLATED subprocesses with no view of this conversation. If earlier
decisions/discussion matter, gather them first (e.g. via vcc_recall) and pass them through:
  - tool: execute_plan({ plan_file, context: "<digest>" })
  - command: /execute <plan> --context <digest-file>  (or a sibling <plan>.context.md)

Plans are markdown files, typically in docs/plans/.`,
};

// ── Config ──────────────────────────────────────────────────────────

const BUILDER_MODEL = MODELS.build;
const CHECKER_MODEL = MODELS.check;
const MAX_ATTEMPTS = 3;
/** Max builder subprocesses running at once within a wave */
const MAX_PARALLEL_BUILDERS = 3;
/** Delete builder logs older than this many days on /execute start */
const LOG_RETENTION_DAYS = 7;

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
Be efficient. Run tests first — if they pass, skip linting unless it's fast.

IMPORTANT: End your report with a final line in EXACTLY this format (nothing after it):
VERDICT: PASS
or
VERDICT: FAIL`;

/**
 * Parse the checker's structured verdict. Returns true=pass, false=fail.
 * Primary: the required `VERDICT: PASS|FAIL` line (last occurrence wins).
 * Fallback (checker didn't comply): conservative heuristic — only fail when failure
 * signals clearly outnumber pass signals, so an output containing "fail" in a passing
 * context (e.g. "don't fail silently", "0 failed") doesn't flip the verdict.
 */
function parseVerdict(output: string): boolean {
  const matches = [...output.matchAll(/VERDICT:\s*(PASS|FAIL)/gi)];
  if (matches.length > 0) {
    return matches[matches.length - 1][1].toUpperCase() === "PASS";
  }
  const failSignals = (
    output.match(
      /\b(\d+\s+(?:failed|failing|errors?)|test.*fail(?:ed|ing)|FAILED)\b/gi,
    ) || []
  ).length;
  const passSignals = (
    output.match(
      /\b(all\s+pass|passed|0\s+fail|no\s+(?:failures|errors))\b/gi,
    ) || []
  ).length;
  return failSignals <= passSignals;
}

/** Run async tasks with a bounded concurrency limit. */
async function runWithConcurrency<T>(
  items: T[],
  limit: number,
  fn: (item: T, index: number) => Promise<void>,
): Promise<void> {
  let cursor = 0;
  const workers = Array.from(
    { length: Math.min(limit, items.length) },
    async () => {
      while (cursor < items.length) {
        const i = cursor++;
        await fn(items[i], i);
      }
    },
  );
  await Promise.all(workers);
}

// ── Log files (drill-down) ──────────────────────────────────────────

function logDir(cwd: string): string {
  return path.join(cwd, ".pi", "execute-logs");
}

function builderLogPath(
  cwd: string,
  planPath: string,
  sectionIndex: number,
): string {
  const planName = path.basename(planPath, ".md");
  return path.join(logDir(cwd), `${planName}-s${sectionIndex + 1}.ndjson`);
}

function checkerLogPath(
  cwd: string,
  planPath: string,
  attempt: number,
): string {
  const planName = path.basename(planPath, ".md");
  return path.join(logDir(cwd), `${planName}-checker-a${attempt}.ndjson`);
}

/** Best-effort cleanup of stale log files. */
function cleanOldLogs(cwd: string): void {
  try {
    const dir = logDir(cwd);
    if (!fs.existsSync(dir)) return;
    const cutoff = Date.now() - LOG_RETENTION_DAYS * 86_400_000;
    for (const f of fs.readdirSync(dir)) {
      const fp = path.join(dir, f);
      try {
        if (fs.statSync(fp).mtimeMs < cutoff) fs.unlinkSync(fp);
      } catch {}
    }
  } catch {}
}

/** Capture a `git diff --stat` + changed-file manifest (best-effort). */
function gitManifest(cwd: string): string {
  try {
    const stat = execSync("git diff --stat", {
      cwd,
      encoding: "utf-8",
      timeout: 10_000,
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
    const porcelain = execSync("git status --porcelain", {
      cwd,
      encoding: "utf-8",
      timeout: 10_000,
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
    if (!stat && !porcelain) return "_(no git changes detected)_";
    const files = porcelain
      .split("\n")
      .filter(Boolean)
      .map((l) => `- \`${l.slice(3)}\` ${l.slice(0, 2).trim()}`)
      .join("\n");
    return `${files}\n\n\`\`\`\n${stat}\n\`\`\``;
  } catch {
    return "_(git manifest unavailable)_";
  }
}

/** Format usage compactly for the widget: "12.4k→1.1k" */
function fmtTokens(u: AgentUsage): string {
  const k = (n: number) => (n >= 1000 ? `${(n / 1000).toFixed(1)}k` : `${n}`);
  return `${k(u.input + u.cacheRead + u.cacheWrite)}→${k(u.output)}`;
}

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
    const match = line.match(
      /^##\s+(?:Task|Step|Phase|Part|Section)\s*\d*[:.—-]\s*(.*)/i,
    );
    if (match) {
      if (current)
        sections.push({
          index: sections.length,
          title: current.title,
          content: current.lines.join("\n"),
        });
      current = {
        title: match[1] || line.replace(/^##\s*/, ""),
        lines: [line],
      };
    } else if (current) {
      current.lines.push(line);
    } else {
      if (!sections.length) {
        if (!current) current = { title: "Plan", lines: [] };
        current.lines.push(line);
      }
    }
  }
  if (current)
    sections.push({
      index: sections.length,
      title: current.title,
      content: current.lines.join("\n"),
    });

  const substantial = sections.filter((s) => s.content.length > 200);
  if (substantial.length < 2)
    return [{ index: 0, title: "Full Plan", content: planContent }];
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

  const sectionSummaries = sections
    .map((s, i) => `### Section ${i}: ${s.title}\n${s.content.slice(0, 500)}`)
    .join("\n\n");

  try {
    const result = await runAgent({
      cwd,
      model: MODELS.check, // Use a fast model for analysis
      systemPrompt: DEPENDENCY_PROMPT,
      tools: "",
      task: `Analyze these ${sections.length} plan sections and determine dependencies:\n\n${sectionSummaries}`,
      signal,
      timeoutMs: 30_000,
    });

    const jsonMatch = result.output.match(/\{[\s\S]*"dependencies"[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]) as DAG;
      // Validate: all indices must be within range
      const valid: DAG = { dependencies: {} };
      for (let i = 0; i < sections.length; i++) {
        const depsMap = parsed.dependencies as
          | Record<string, number[]>
          | undefined;
        const deps = depsMap?.[i] || depsMap?.[String(i)] || [];
        valid.dependencies[i] = (deps as number[]).filter(
          (d: number) =>
            typeof d === "number" && d >= 0 && d < sections.length && d !== i,
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
  /** Cumulative tokens across all subagents (optional; added in UX upgrade) */
  tokensTotal?: number;
  /** Cumulative cost in USD (optional) */
  cost?: number;
}

function statusPath(cwd: string, planPath: string): string {
  const planName = path.basename(planPath, ".md");
  return path.join(cwd, ".pi", `STATUS-${planName}.md`);
}

function writeStatus(
  cwd: string,
  planPath: string,
  status: ExecutionStatus,
): void {
  const filePath = statusPath(cwd, planPath);
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

  const content = `# Execution Status: ${path.basename(planPath)}

**Started:** ${status.startedAt}
**Attempt:** ${status.attempt}/${MAX_ATTEMPTS}
**Passed:** ${status.passed ? "✅ Yes" : "❌ No"}

## Completed Sections
${status.completedSections.map((i) => `- [x] Section ${i}`).join("\n") || "None yet"}

## Failed Sections
${status.failedSections.map((i) => `- [ ] Section ${i}`).join("\n") || "None"}

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
  } catch {
    /* ignore */
  }
  return null;
}

function clearStatus(cwd: string, planPath: string): void {
  const filePath = statusPath(cwd, planPath);
  if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
}

// ── Transcript viewer (drill-down) ────────────────────────────────

/** Parse a builder's raw NDJSON log into a readable transcript (array of lines). */
function parseTranscript(logFile: string): string[] {
  const out: string[] = [];
  let raw: string;
  try {
    raw = fs.readFileSync(logFile, "utf-8");
  } catch {
    return ["(could not read log file)"];
  }
  for (const line of raw.split("\n")) {
    if (!line.trim()) continue;
    // biome-ignore lint/suspicious/noExplicitAny: streaming NDJSON events have a dynamic shape
    let ev: any;
    try {
      ev = JSON.parse(line);
    } catch {
      continue;
    }
    const t = ev.type;
    if (t === "turn_start") {
      out.push("", "── turn ──");
    } else if (t === "tool_call_start") {
      const tc = ev.toolCall || {};
      const a = tc.arguments || {};
      let detail = a.path || a.command || a.pattern || a.query || "";
      if (typeof detail === "string" && detail.length > 80)
        detail = `${detail.slice(0, 80)}…`;
      out.push(`  🔧 ${tc.name || "tool"}${detail ? ` ${detail}` : ""}`);
    } else if (t === "tool_execution_end") {
      if (ev.result?.isError) out.push("     ✗ error");
    } else if (t === "message_end" && ev.message?.role === "assistant") {
      for (const part of ev.message.content || []) {
        if (part.type === "text" && part.text?.trim()) {
          out.push(
            "",
            ...part.text
              .trim()
              .split("\n")
              .map((l: string) => `  ${l}`),
          );
        }
      }
      const u = ev.message.usage;
      if (u)
        out.push(
          `  · ${u.totalTokens ?? 0} tok${u.cost?.total ? ` · $${u.cost.total.toFixed(4)}` : ""}`,
        );
    }
  }
  if (out.length === 0) out.push("(empty or still-running log)");
  return out;
}

/** Show a scrollable transcript overlay. Resolves when the user closes it. */
async function showTranscript(
  ctx: ExtensionContext,
  title: string,
  lines: string[],
): Promise<void> {
  await ctx.ui.custom<null>((tui, theme, _kb, done) => {
    let scroll = 0;
    let cached: string[] | undefined;
    const VISIBLE = 24;
    const maxScroll = () => Math.max(0, lines.length - VISIBLE);

    function handleInput(data: string) {
      if (matchesKey(data, Key.up) || data === "k") {
        scroll = Math.max(0, scroll - 1);
        cached = undefined;
        tui.requestRender();
        return;
      }
      if (matchesKey(data, Key.down) || data === "j") {
        scroll = Math.min(maxScroll(), scroll + 1);
        cached = undefined;
        tui.requestRender();
        return;
      }
      if (data === " ") {
        scroll = Math.min(maxScroll(), scroll + VISIBLE);
        cached = undefined;
        tui.requestRender();
        return;
      }
      if (matchesKey(data, Key.escape) || data === "q") {
        done(null);
      }
    }

    function render(width: number): string[] {
      if (cached) return cached;
      const w = Math.max(1, width);
      const rendered: string[] = [theme.fg("accent", "─".repeat(w))];
      rendered.push(
        truncateToWidth(
          theme.fg("accent", theme.bold(` 🔍 ${title}`)) +
            theme.fg(
              "dim",
              `  (${scroll + 1}-${Math.min(lines.length, scroll + VISIBLE)}/${lines.length})`,
            ),
          w,
        ),
      );
      rendered.push(theme.fg("border", "─".repeat(w)));
      for (const l of lines.slice(scroll, scroll + VISIBLE)) {
        for (const wl of wrapTextWithAnsi(l, w))
          rendered.push(theme.fg("text", wl));
      }
      rendered.push(theme.fg("border", "─".repeat(w)));
      rendered.push(
        truncateToWidth(
          theme.fg("dim", " j/k or ↑↓ scroll · space page · q/esc close"),
          w,
        ),
      );
      rendered.push(theme.fg("accent", "─".repeat(w)));
      cached = rendered;
      return rendered;
    }

    return {
      render,
      invalidate: () => {
        cached = undefined;
      },
      handleInput,
    };
  });
}

// ── Extension ───────────────────────────────────────────────────────

export function init(pi: ExtensionAPI, isEnabled: () => boolean) {
  let currentCtx: ExtensionContext | undefined;

  pi.on("session_start", async (_ev, ctx) => {
    currentCtx = ctx;
  });

  // ── Live widget state ───────────────────────────────────────────
  type AgentState = {
    status: "running" | "done" | "error";
    activity: string;
    startTime: number;
    sectionIndex?: number;
    usage: AgentUsage;
    files: string[];
  };
  const agents: Record<string, AgentState> = {};
  let widgetPhase = "";
  let phaseStart = 0;
  let stopHint = "";
  let timerHandle: ReturnType<typeof setInterval> | undefined;
  // Execution control: in-flight guard + per-section abort controllers
  let executing = false;
  let currentAbort: AbortController | undefined;
  let currentLogInfo: { cwd: string; planPath: string } | undefined;
  const builderAborts = new Map<number, AbortController>();
  const SPIN = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];

  function emptyUsage(): AgentUsage {
    return {
      input: 0,
      output: 0,
      cacheRead: 0,
      cacheWrite: 0,
      total: 0,
      cost: 0,
      toolCalls: 0,
    };
  }

  function waveTotals(): AgentUsage {
    const t = emptyUsage();
    for (const s of Object.values(agents)) {
      t.input += s.usage.input;
      t.output += s.usage.output;
      t.cacheRead += s.usage.cacheRead;
      t.cacheWrite += s.usage.cacheWrite;
      t.total += s.usage.total;
      t.cost += s.usage.cost;
      t.toolCalls += s.usage.toolCalls;
    }
    return t;
  }

  function updateWidget() {
    if (!currentCtx || !isEnabled()) return;
    const spinFrame = SPIN[Math.floor(Date.now() / 100) % SPIN.length];
    currentCtx.ui.setWidget(
      "executor",
      (_tui, theme) => ({
        render(width: number): string[] {
          const border = theme.fg("border", "─".repeat(width));
          const elapsed = ((Date.now() - phaseStart) / 1000).toFixed(0);
          const header =
            theme.fg("accent", theme.bold(" 🔨 Executor")) +
            theme.fg("dim", ` — ${widgetPhase}`) +
            theme.fg("dim", ` (${elapsed}s)`);
          const lines = [border, truncateToWidth(header, width)];

          for (const [label, state] of Object.entries(agents)) {
            const icon =
              state.status === "done"
                ? theme.fg("success", "✓")
                : state.status === "error"
                  ? theme.fg("error", "✗")
                  : theme.fg("warning", spinFrame);
            const sec = ((Date.now() - state.startTime) / 1000).toFixed(0);
            const tok =
              state.usage.total > 0
                ? theme.fg("dim", ` ${fmtTokens(state.usage)}`)
                : "";
            const tools =
              state.usage.toolCalls > 0
                ? theme.fg("dim", ` ${state.usage.toolCalls}🔧`)
                : "";
            const activity = state.activity
              ? theme.fg("muted", `  ${state.activity}`)
              : "";
            lines.push(
              truncateToWidth(
                ` ${icon} ${theme.fg("accent", label)} ${theme.fg("dim", `${sec}s`)}${tok}${tools}${activity}`,
                width,
              ),
            );
          }

          const totals = waveTotals();
          if (totals.total > 0) {
            const costStr =
              totals.cost > 0 ? ` · $${totals.cost.toFixed(3)}` : "";
            lines.push(
              truncateToWidth(
                theme.fg("dim", ` Σ ${fmtTokens(totals)} tok${costStr}`),
                width,
              ),
            );
          }
          if (stopHint)
            lines.push(truncateToWidth(theme.fg("dim", ` ${stopHint}`), width));

          lines.push(border);
          return lines;
        },
        invalidate() {},
        dispose() {},
      }),
      { placement: "aboveEditor" },
    );
  }

  function clearWidget() {
    if (timerHandle) {
      clearInterval(timerHandle);
      timerHandle = undefined;
    }
    currentCtx?.ui.setWidget("executor", undefined);
  }

  function startTimer() {
    if (timerHandle) clearInterval(timerHandle);
    if (currentCtx) {
      timerHandle = setInterval(() => updateWidget(), 1000);
      if (
        timerHandle &&
        typeof timerHandle === "object" &&
        "unref" in timerHandle
      ) {
        (timerHandle as { unref?: () => void }).unref?.();
      }
    }
  }

  function setAgent(
    name: string,
    status: "running" | "done" | "error",
    activity: string,
    sectionIndex?: number,
  ) {
    if (!agents[name])
      agents[name] = {
        status,
        activity,
        startTime: Date.now(),
        sectionIndex,
        usage: emptyUsage(),
        files: [],
      };
    else {
      agents[name].status = status;
      agents[name].activity = activity;
      if (sectionIndex !== undefined) agents[name].sectionIndex = sectionIndex;
    }
    updateWidget();
  }

  function setAgentUsage(name: string, usage: AgentUsage) {
    if (agents[name]) agents[name].usage = usage;
  }

  function addAgentFile(name: string, filePath: string) {
    const a = agents[name];
    if (!a) return;
    const base = path.basename(filePath);
    if (!a.files.includes(base)) {
      a.files.push(base);
      if (a.files.length > 12) a.files.shift();
    }
  }

  function resetAgents() {
    for (const key of Object.keys(agents)) delete agents[key];
  }

  async function executePlan(
    planContent: string,
    planPath: string,
    cwd: string,
    signal: AbortSignal | undefined,
    // biome-ignore lint/suspicious/noExplicitAny: upstream AgentToolUpdateCallback type is not resolvable (pi-agent-core not installed locally)
    onUpdate?: (partial: any) => void,
    checkpoint?: (waves: PlanSection[][]) => Promise<boolean>,
    contextDigest?: string,
  ): Promise<string> {
    phaseStart = Date.now();
    resetAgents();
    startTimer();
    cleanOldLogs(cwd);

    const sections = splitPlan(planContent);
    const planSummary =
      planContent.length > 4000
        ? `${planContent.slice(0, 4000)}\n\n... (plan truncated)`
        : planContent;

    // ── Check for resumable status ──
    const prevStatus = readStatus(cwd, planPath);
    let startAttempt = 1;
    let completedIndices = new Set<number>();
    let prevCheckerOutput = "";

    if (prevStatus && !prevStatus.passed && prevStatus.attempt < MAX_ATTEMPTS) {
      startAttempt = prevStatus.attempt + 1;
      // Validate completed indices against the current plan (it may have changed)
      completedIndices = new Set(
        (prevStatus.completedSections || []).filter(
          (i) => i >= 0 && i < sections.length,
        ),
      );
      prevCheckerOutput = prevStatus.checkerOutput;
      onUpdate?.({
        content: [
          {
            type: "text",
            text: `♻️ Resuming from attempt ${prevStatus.attempt} — ${completedIndices.size}/${sections.length} sections done`,
          },
        ],
      });
    }

    // ── Analyze dependencies and build waves ──
    let waves: PlanSection[][];

    if (sections.length <= 1) {
      waves = [sections];
    } else {
      widgetPhase = "analyzing dependencies";
      setAgent("analyzer", "running", "determining section dependencies...");
      updateWidget();
      onUpdate?.({
        content: [
          {
            type: "text",
            text: `🔍 Analyzing dependencies for ${sections.length} sections...`,
          },
        ],
      });

      const dag = await analyzeDependencies(sections, cwd, signal);
      waves = buildWaves(sections, dag);

      setAgent("analyzer", "done", `${waves.length} waves planned`);
      onUpdate?.({
        content: [
          {
            type: "text",
            text: `📊 DAG: ${sections.length} sections → ${waves.length} waves (${waves.map((w) => w.length).join(", ")} per wave)`,
          },
        ],
      });
    }

    // ── Human-in-the-loop checkpoint (interactive runs only) ──
    if (checkpoint) {
      const approved = await checkpoint(waves);
      if (!approved) {
        clearWidget();
        return `## Execution Cancelled\n\nUser declined the wave plan before execution.\n**Plan:** ${planPath}`;
      }
    }

    // Prior context/decisions from the MAIN session (vcc_recall digest, plan rationale, etc.)
    // Injected into every builder so isolated subprocesses aren't blind to earlier decisions.
    const priorContext = contextDigest?.trim()
      ? `\n\n## Prior Decisions & Context (from the main session — honor these)\n${contextDigest.trim().slice(0, 3000)}`
      : "";
    if (priorContext)
      onUpdate?.({
        content: [
          {
            type: "text",
            text: `🧠 Injecting ${contextDigest!.trim().length > 3000 ? "3000 (truncated)" : contextDigest!.trim().length} chars of prior context into builders`,
          },
        ],
      });

    let attempt = startAttempt;
    const sectionOutputs = new Map<number, string>();
    let checkerOutput = prevCheckerOutput;
    let passed = false;

    while (attempt <= MAX_ATTEMPTS && !passed) {
      widgetPhase = `attempt ${attempt}/${MAX_ATTEMPTS}`;
      resetAgents();

      // Failure context injected into builders on retry attempts
      const failureCtx =
        attempt > startAttempt || (attempt === startAttempt && checkerOutput)
          ? `\n\n## Previous attempt had failures — fix these\n${checkerOutput.slice(0, 2500)}`
          : "";

      // ── Run waves (the only build path) ──
      for (let wi = 0; wi < waves.length; wi++) {
        const wave = waves[wi];
        const pending = wave.filter((s) => !completedIndices.has(s.index));
        if (pending.length === 0) continue;

        widgetPhase = `wave ${wi + 1}/${waves.length} (attempt ${attempt}/${MAX_ATTEMPTS})`;
        stopHint =
          "/execute-stop [section|all] to cancel · /execute-log [section] to inspect";
        onUpdate?.({
          content: [
            {
              type: "text",
              text: `🌊 Wave ${wi + 1}/${waves.length}: ${pending.length} section${pending.length > 1 ? "s" : ""} (max ${MAX_PARALLEL_BUILDERS} parallel)`,
            },
          ],
        });

        await runWithConcurrency(
          pending,
          MAX_PARALLEL_BUILDERS,
          async (sec) => {
            const label = `builder-${sec.index + 1}`;
            setAgent(label, "running", sec.title.slice(0, 40), sec.index);
            // Per-section abort controller, chained to the global execution signal
            const ac = new AbortController();
            if (signal) {
              if (signal.aborted) ac.abort();
              else
                signal.addEventListener("abort", () => ac.abort(), {
                  once: true,
                });
            }
            builderAborts.set(sec.index, ac);
            let result;
            try {
              result = await runAgent({
                cwd,
                model: BUILDER_MODEL,
                systemPrompt: BUILDER_PROMPT,
                tools: "read,write,edit,bash,grep,find,ls",
                task: `Implement this section of the plan:\n\n## Context (plan overview)\n${planSummary.slice(0, 2000)}${priorContext}\n\n## Your Section\n${sec.content}${failureCtx}`,
                signal: ac.signal,
                logPath: builderLogPath(cwd, planPath, sec.index),
                onActivity: (activity) => {
                  setAgent(label, "running", activity);
                },
                onEvent: (e) => {
                  if (e.kind === "usage" && e.usage)
                    setAgentUsage(label, e.usage);
                  else if (e.kind === "file" && e.path)
                    addAgentFile(label, e.path);
                },
              });
            } finally {
              builderAborts.delete(sec.index);
            }
            setAgentUsage(label, result.usage);
            const ok = result.exitCode === 0;
            setAgent(
              label,
              ok ? "done" : "error",
              ok ? "complete" : ac.signal.aborted ? "stopped" : "failed",
            );
            if (ok) completedIndices.add(sec.index);
            sectionOutputs.set(
              sec.index,
              `### Section ${sec.index + 1}: ${sec.title}\n${result.output.slice(0, 1500)}`,
            );
          },
        );

        // Persist progress after each wave
        const totals = waveTotals();
        writeStatus(cwd, planPath, {
          planPath,
          startedAt: new Date(phaseStart).toISOString(),
          attempt,
          completedSections: Array.from(completedIndices),
          failedSections: sections
            .filter((s) => !completedIndices.has(s.index))
            .map((s) => s.index),
          checkerOutput: "",
          passed: false,
          tokensTotal: totals.total,
          cost: totals.cost,
        });
      }

      const builderOutput = Array.from(sectionOutputs.entries())
        .sort((a, b) => a[0] - b[0])
        .map((e) => e[1])
        .join("\n\n");

      // ── Check ──
      widgetPhase = `checking (attempt ${attempt}/${MAX_ATTEMPTS})`;
      setAgent("checker", "running", "starting...");
      updateWidget();
      onUpdate?.({
        content: [{ type: "text", text: `🔍 Checking attempt ${attempt}...` }],
      });

      const check = await runAgent({
        cwd,
        model: CHECKER_MODEL,
        systemPrompt: CHECKER_PROMPT,
        tools: "read,bash,grep,find,ls",
        task: `Run tests, type-check, and lint for this project. Report PASS or FAIL with details.\n\nBuilder's summary of what changed:\n${builderOutput.slice(0, 2000)}`,
        signal,
        logPath: checkerLogPath(cwd, planPath, attempt),
        onActivity: (activity) => {
          setAgent("checker", "running", activity);
        },
        onEvent: (e) => {
          if (e.kind === "usage" && e.usage) setAgentUsage("checker", e.usage);
        },
      });
      setAgentUsage("checker", check.usage);
      checkerOutput = check.output;

      // Structured verdict: a non-zero checker exit is always a FAIL
      passed = check.exitCode === 0 && parseVerdict(checkerOutput);
      setAgent(
        "checker",
        passed ? "done" : "error",
        passed ? "all passed" : "failures found",
      );

      const totals = waveTotals();
      writeStatus(cwd, planPath, {
        planPath,
        startedAt: new Date(phaseStart).toISOString(),
        attempt,
        completedSections: Array.from(completedIndices),
        failedSections: [],
        checkerOutput,
        passed,
        tokensTotal: totals.total,
        cost: totals.cost,
      });

      if (passed) {
        onUpdate?.({
          content: [
            { type: "text", text: `✅ Checks passed on attempt ${attempt}` },
          ],
        });
        clearStatus(cwd, planPath);
      } else {
        onUpdate?.({
          content: [
            {
              type: "text",
              text: `❌ Checks failed (attempt ${attempt}/${MAX_ATTEMPTS})`,
            },
          ],
        });
        // Re-run all sections next attempt WITH the failure context injected
        if (attempt < MAX_ATTEMPTS) completedIndices = new Set<number>();
      }

      attempt++;
    }

    const t = setTimeout(() => clearWidget(), 3000);
    if (t && typeof t === "object" && "unref" in t)
      (t as { unref?: () => void }).unref?.();

    const finalBuilderOutput = Array.from(sectionOutputs.entries())
      .sort((a, b) => a[0] - b[0])
      .map((e) => e[1])
      .join("\n\n");
    const totalSections = sections.length;
    const waveInfo =
      waves.length > 1
        ? `\n**Waves:** ${waves.length} (${waves.map((w) => w.length).join(" → ")})`
        : "";
    const status = passed
      ? "✅ All checks passed"
      : `⚠️ Checks still failing after ${MAX_ATTEMPTS} attempts`;
    const grand = waveTotals();
    const costLine =
      grand.total > 0
        ? `\n**Tokens:** ${fmtTokens(grand)}${grand.cost > 0 ? ` · $${grand.cost.toFixed(3)}` : ""}`
        : "";
    const manifest = gitManifest(cwd);
    return `## Execution Summary\n\n**Status:** ${status}\n**Attempts:** ${attempt - 1}\n**Sections:** ${totalSections}${waveInfo}${costLine}\n**Plan:** ${planPath}\n\n### Files Changed\n${manifest}\n\n### Builder Output\n${finalBuilderOutput.slice(0, 4000)}\n\n### Checker Report\n${checkerOutput.slice(0, 3000)}`;
  }

  // ── /execute command ────────────────────────────────────────────

  pi.registerCommand("execute", {
    description:
      "Execute a plan: /execute <plan-file> [--context <digest-file>]",
    handler: async (args, ctx) => {
      // Optional prior-context digest: --context <file> (or auto-detected sibling <plan>.context.md)
      let contextDigest: string | undefined;
      let rawArgs = args.trim();
      const ctxMatch = rawArgs.match(/--context\s+(\S+)/);
      if (ctxMatch) {
        const cpath = path.resolve(ctx.cwd, ctxMatch[1]);
        try {
          contextDigest = fs.readFileSync(cpath, "utf-8");
        } catch {
          ctx.ui.notify(`Context file not found: ${ctxMatch[1]}`, "warning");
        }
        rawArgs = rawArgs.replace(ctxMatch[0], "").trim();
      }
      let planPath = rawArgs;
      if (!planPath) {
        const planDir = path.join(ctx.cwd, "docs", "plans");
        if (fs.existsSync(planDir)) {
          const files = fs
            .readdirSync(planDir)
            .filter((f) => f.endsWith(".md"))
            .sort()
            .reverse();
          if (files.length) {
            planPath = path.join("docs", "plans", files[0]);
            ctx.ui.notify(`Using latest plan: ${planPath}`, "info");
          }
        }
        if (!planPath) {
          ctx.ui.notify(
            "Usage: /execute <plan-file> or create a plan first with /plan",
            "warning",
          );
          return;
        }
      }

      const fullPath = path.resolve(ctx.cwd, planPath);
      if (!fs.existsSync(fullPath)) {
        ctx.ui.notify(`Plan not found: ${planPath}`, "error");
        return;
      }

      // Auto-detect a sibling "<plan>.context.md" digest if none passed explicitly
      if (!contextDigest) {
        const sibling = fullPath.replace(/\.md$/, ".context.md");
        if (fs.existsSync(sibling)) {
          try {
            contextDigest = fs.readFileSync(sibling, "utf-8");
            ctx.ui.notify(`Loaded context: ${path.basename(sibling)}`, "info");
          } catch {}
        }
      }

      if (executing) {
        ctx.ui.notify(
          "An execution is already in progress. Use /execute-stop all to cancel it first.",
          "warning",
        );
        return;
      }

      const planContent = fs.readFileSync(fullPath, "utf-8");
      const abort = new AbortController();
      currentAbort = abort;
      currentLogInfo = { cwd: ctx.cwd, planPath };
      executing = true;

      // Interactive HITL checkpoint: approve the wave plan before executing.
      const checkpoint =
        ctx.mode === "tui"
          ? async (waves: PlanSection[][]) => {
              if (waves.length <= 1 && (waves[0]?.length ?? 0) <= 1)
                return true; // trivial single-section plan
              const plan = waves
                .map(
                  (w, i) =>
                    `Wave ${i + 1}: ${w.map((s) => `§${s.index + 1} ${s.title}`).join(", ")}`,
                )
                .join("\n");
              return ctx.ui.confirm(
                "Execute this wave plan?",
                `${waves.length} wave(s), ${waves.reduce((n, w) => n + w.length, 0)} sections:\n\n${plan}`,
              );
            }
          : undefined;

      try {
        const summary = await executePlan(
          planContent,
          planPath,
          ctx.cwd,
          abort.signal,
          undefined,
          checkpoint,
          contextDigest,
        );
        pi.sendUserMessage(summary, { deliverAs: "followUp" });
      } finally {
        executing = false;
        if (currentAbort === abort) currentAbort = undefined;
      }
    },
  });

  // ── /execute-stop command ────────────────────────────────────

  pi.registerCommand("execute-stop", {
    description: "Stop a running execution: /execute-stop [section-number|all]",
    handler: async (args, ctx) => {
      const arg = args.trim().toLowerCase();
      if (!executing) {
        ctx.ui.notify("No execution is currently running.", "info");
        return;
      }
      if (arg === "" || arg === "all") {
        currentAbort?.abort();
        for (const ac of builderAborts.values()) ac.abort();
        ctx.ui.notify("Aborting entire execution…", "warning");
        return;
      }
      const num = Number.parseInt(arg, 10);
      if (Number.isNaN(num)) {
        ctx.ui.notify("Usage: /execute-stop [section-number|all]", "warning");
        return;
      }
      const ac = builderAborts.get(num - 1); // section-number is 1-based; sec.index is 0-based
      if (ac) {
        ac.abort();
        ctx.ui.notify(`Stopping section ${num}…`, "warning");
      } else ctx.ui.notify(`Section ${num} is not currently running.`, "info");
    },
  });

  // ── /execute-log command (drill-down viewer) ───────────────────────

  pi.registerCommand("execute-log", {
    description:
      "Inspect a builder's transcript: /execute-log [section-number]",
    handler: async (args, ctx) => {
      if (ctx.mode !== "tui") {
        ctx.ui.notify("Log viewer needs the TUI.", "warning");
        return;
      }
      const info = currentLogInfo;
      const dir = logDir(ctx.cwd);
      if (!fs.existsSync(dir)) {
        ctx.ui.notify("No execution logs found yet.", "info");
        return;
      }

      let logFile: string | undefined;
      const arg = args.trim();
      if (arg && info) {
        const num = Number.parseInt(arg, 10);
        if (!Number.isNaN(num))
          logFile = builderLogPath(ctx.cwd, info.planPath, num - 1);
      }
      if (!logFile || !fs.existsSync(logFile)) {
        const files = fs
          .readdirSync(dir)
          .filter((f) => f.endsWith(".ndjson"))
          .sort();
        if (!files.length) {
          ctx.ui.notify("No execution logs found.", "info");
          return;
        }
        const pick = await ctx.ui.select("Inspect which builder log?", files);
        if (!pick) return;
        logFile = path.join(dir, pick);
      }

      const transcript = parseTranscript(logFile);
      await showTranscript(ctx, path.basename(logFile), transcript);
    },
  });

  // ── execute_plan tool ───────────────────────────────────────────

  pi.registerTool({
    name: "execute_plan",
    label: "Execute Plan",
    description:
      "Execute a plan file with DAG-scheduled parallel waves. Splits plan into sections, analyzes dependencies, runs independent sections in parallel. Progress saved to STATUS.md for resume. Builders run as isolated subprocesses with no access to this conversation — if earlier decisions/discussion matter, first call vcc_recall to gather them and pass the digest via the `context` param so every builder honors them.",
    parameters: Type.Object({
      plan_file: Type.String({ description: "Path to the plan .md file" }),
      context: Type.Optional(
        Type.String({
          description:
            "Prior-context digest (decisions, constraints, prior exploration) to inject into every builder subprocess. Builders are isolated and cannot see this conversation; populate this (e.g. from vcc_recall) when earlier context is needed.",
        }),
      ),
    }),
    async execute(_id, params, signal, onUpdate, ctx) {
      const fullPath = path.resolve(ctx.cwd, params.plan_file);
      if (!fs.existsSync(fullPath)) {
        return {
          content: [
            { type: "text", text: `Plan not found: ${params.plan_file}` },
          ],
          details: {},
        };
      }

      const planContent = fs.readFileSync(fullPath, "utf-8");
      currentLogInfo = { cwd: ctx.cwd, planPath: params.plan_file };
      // Tool path is non-interactive (no HITL checkpoint) so the agent flow stays unblocked
      const summary = await executePlan(
        planContent,
        params.plan_file,
        ctx.cwd,
        signal,
        onUpdate,
        undefined,
        params.context,
      );

      return { content: [{ type: "text", text: summary }], details: {} };
    },
    renderCall(args, theme) {
      return new Text(
        theme.fg("toolTitle", theme.bold("execute_plan ")) +
          theme.fg("accent", args.plan_file || "?"),
        0,
        0,
      );
    },
    renderResult(result, _opts, theme) {
      const text =
        result.content[0]?.type === "text" ? result.content[0].text : "";
      const passed = text.includes("✅");
      return new Text(
        passed
          ? theme.fg("success", "✓ Execution complete — all checks passed")
          : theme.fg("warning", "⚠ Execution complete — see details"),
        0,
        0,
      );
    },
  });
}
