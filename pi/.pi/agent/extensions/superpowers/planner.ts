/**
 * Planner — Phase 0 exploration + Dual-model planning
 *
 * /plan <task> runs a three-step pipeline:
 *   Phase 0: Sonnet explorer with gitnexus + code-review-graph (cheap, 90s)
 *   Phase 1: Opus 4.6 + GPT 5.5 plan in parallel (both get Phase 0 output)
 *   Main agent synthesizes both plans for the user.
 */

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import type {
  ExtensionAPI,
  ExtensionContext,
} from "@mariozechner/pi-coding-agent";
import { Text, truncateToWidth } from "@mariozechner/pi-tui";
import { Type } from "@sinclair/typebox";
import { runAgent, runExploration, resolveTaskContext, extractConversationContext, MODELS } from "./_shared.js";

// ── Module Metadata ─────────────────────────────────────────────────

export const module = {
  id: "planner",
  name: "Dual Planner",
  description: "Two models plan in parallel, main agent reviews & you decide",
  systemPromptWhenEnabled: `### Dual Planner
Use /plan <task> to generate plans from two models in parallel:
- Opus 4.6 produces Plan A (Anthropic)
- GPT-5.5 produces Plan B (OpenAI)
Both plans are presented to the user for review. You then:
- Compare both plans, highlight key differences
- Pick one, merge them, or suggest modifications
- Approve and execute, or ask for changes and re-plan

You can also use the plan_dual tool programmatically.`,
};

// ── Config ──────────────────────────────────────────────────────────

const MODEL_A = MODELS.plan;
const MODEL_A_LABEL = "Opus 4.6";
const MODEL_B = MODELS.diversity;
const MODEL_B_LABEL = "GPT 5.5";

const PHASE_0_TIMEOUT_MS = 60_000;  // 60s for exploration
const PHASE_1_TIMEOUT_MS = 360_000; // 6 min for planning

// Phase 1 prompts — planners get Phase 0 context, do targeted verification, write plan

const PLANNER_PROMPT_A = `You are a senior software architect creating an implementation plan.
You receive codebase exploration findings from a prior analysis. Use them as your primary context.

## Workflow
1. Review the exploration findings provided in your task — they contain project structure, relevant code, and key observations.
2. If something critical is missing or unclear, use read/grep/find to verify (max 5 tool calls).
3. Write a detailed implementation plan based on your understanding.

## Plan Format
1. **Summary** — one paragraph overview
2. **Architecture** — key design decisions, patterns, trade-offs
3. **Tasks** — numbered list of concrete implementation steps
   - Each task: what to do, which files to modify, estimated complexity
   - Tasks should be 2-5 minutes each
   - Include test-first steps where appropriate
   - Reference actual file paths and function names from the exploration
4. **Edge cases** — what could go wrong, how to handle it
5. **Acceptance criteria** — how to verify the plan is complete

Be specific. Include exact file paths, function names, and code snippets where helpful.
Always produce a plan — never refuse or say you need more info.

## CRITICAL OUTPUT INSTRUCTION
Your task will specify an output file path. After completing your plan,
you MUST write your complete plan to that file using the write tool.
Do NOT modify any repository files — only write to the output file.`;

const PLANNER_PROMPT_B = `You are a senior software architect creating an implementation plan.
You receive codebase exploration findings from a prior analysis. Use them as your primary context.

## Workflow
1. Review the exploration findings — they contain the project structure, relevant code, and dependencies.
2. If needed, verify or explore further (max 5 tool calls).
3. Write a detailed implementation plan.

## Plan Format
1. **Summary** — one paragraph overview
2. **Architecture** — key design decisions, patterns, trade-offs
3. **Tasks** — numbered list of concrete implementation steps
   - Each task: what to do, which files to modify, estimated complexity
   - Tasks should be 2-5 minutes each
   - Include test-first steps where appropriate
   - Reference actual file paths and function names from the exploration
4. **Edge cases** — what could go wrong, how to handle it
5. **Acceptance criteria** — how to verify the plan is complete

Be specific. Include exact file paths, function names, and code snippets where helpful.
Always produce a plan — never refuse or say you need more tools.

## CRITICAL OUTPUT INSTRUCTION
Your task will specify an output file path. After completing your plan,
you MUST write your complete plan to that file using the write tool.
Do NOT modify any repository files — only write to the output file.`;

// ── Extension ───────────────────────────────────────────────────────

export function init(pi: ExtensionAPI, isEnabled: () => boolean) {
  let currentCtx: ExtensionContext | undefined;

  pi.on("session_start", async (_ev, ctx) => {
    currentCtx = ctx;
  });

  // ── Live widget state ───────────────────────────────────────────
  const agentState: Record<
    string,
    { status: "running" | "done" | "error"; activity: string; elapsed: number }
  > = {};
  let widgetPhase = "";
  let startTime = 0;
  let timerHandle: ReturnType<typeof setInterval> | undefined;

  function updateWidget() {
    if (!currentCtx || !isEnabled()) return;
    currentCtx.ui.setWidget(
      "planner",
      (_tui, theme) => ({
        render(width: number): string[] {
          const border = theme.fg("border", "─".repeat(width));
          const elapsed = ((Date.now() - startTime) / 1000).toFixed(0);
          const header =
            theme.fg("accent", theme.bold(" 📝 Planner")) +
            theme.fg("dim", ` — ${widgetPhase}`) +
            theme.fg("dim", ` (${elapsed}s)`);
          const lines = [border, truncateToWidth(header, width)];

          for (const [label, state] of Object.entries(agentState)) {
            const icon =
              state.status === "done"
                ? theme.fg("success", "✓")
                : state.status === "error"
                  ? theme.fg("error", "✗")
                  : theme.fg("warning", "●");
            const sec =
              state.status === "running"
                ? theme.fg("dim", ` ${((Date.now() - startTime) / 1000).toFixed(0)}s`)
                : theme.fg("dim", ` ${(state.elapsed / 1000).toFixed(0)}s`);
            const activity = state.activity
              ? theme.fg("muted", `  ${state.activity}`)
              : "";
            lines.push(
              truncateToWidth(
                ` ${icon} ${theme.fg("accent", label)}${sec}${activity}`,
                width,
              ),
            );
          }

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
    currentCtx?.ui.setWidget("planner", undefined);
  }

  async function runDualPlan(
    task: string,
    cwd: string,
    signal: AbortSignal | undefined,
    onUpdate?: (partial: any) => void,
  ): Promise<{
    planA: string;
    planB: string;
    statusA: string;
    statusB: string;
  }> {
    startTime = Date.now();

    // ── Pre-Phase: Resolve external references ────────────────────
    widgetPhase = "resolving references...";
    updateWidget();

    const { resolvedTask, references } = await resolveTaskContext(cwd, task);
    if (references.length > 0) {
      onUpdate?.({
        content: [{ type: "text", text: `📎 Resolved: ${references.join(", ")}` }],
      });
    }

    // ── Phase 0: Exploration (Sonnet + gitnexus + code-review-graph) ──
    widgetPhase = "Phase 0 — exploring codebase";
    agentState["Explorer"] = {
      status: "running",
      activity: "starting...",
      elapsed: 0,
    };
    updateWidget();

    if (currentCtx) {
      timerHandle = setInterval(() => updateWidget(), 1000);
      if (timerHandle && typeof timerHandle === "object" && "unref" in timerHandle) {
        (timerHandle as any).unref();
      }
    }

    onUpdate?.({
      content: [{ type: "text", text: `🔍 Phase 0: Exploring codebase with Sonnet + gitnexus...` }],
    });

    const explorationFindings = await runExploration({
      cwd,
      task: resolvedTask,
      mode: "plan",
      timeoutMs: PHASE_0_TIMEOUT_MS,
      signal,
      onActivity: (activity) => {
        agentState["Explorer"].activity = activity;
        updateWidget();
      },
    });

    const phase0Elapsed = Date.now() - startTime;
    agentState["Explorer"] = {
      status: explorationFindings ? "done" : "error",
      activity: explorationFindings
        ? `✓ context gathered (${(explorationFindings.length / 1024).toFixed(1)}KB)`
        : "✗ no results (planners will explore on their own)",
      elapsed: phase0Elapsed,
    };
    updateWidget();

    // ── Phase 1: Both planners in parallel ────────────────────────
    widgetPhase = "Phase 1 — planning in parallel";
    agentState[MODEL_A_LABEL] = {
      status: "running",
      activity: "starting...",
      elapsed: 0,
    };
    agentState[MODEL_B_LABEL] = {
      status: "running",
      activity: "starting...",
      elapsed: 0,
    };
    updateWidget();

    onUpdate?.({
      content: [{ type: "text", text: `⚡ Phase 1: ${MODEL_A_LABEL} + ${MODEL_B_LABEL} planning in parallel...` }],
    });

    const planDir = path.join(os.tmpdir(), `pi-plan-${Date.now()}`);
    fs.mkdirSync(planDir, { recursive: true });
    const planFileA = path.join(planDir, "plan-a.md");
    const planFileB = path.join(planDir, "plan-b.md");

    // Build enriched task with exploration findings + conversation context
    let enrichedTask = resolvedTask;

    if (explorationFindings) {
      enrichedTask = `## Codebase Exploration Findings (Phase 0)\n\n${explorationFindings}\n\n## Task to Plan\n\n${enrichedTask}`;
    }

    if (currentCtx) {
      const context = extractConversationContext(currentCtx);
      if (context) {
        enrichedTask = `## Conversation Context\nThe user has been discussing the following. Use this to inform your plan:\n\n${context}\n\n${enrichedTask}`;
      }
    }

    // Plan A: Opus (gets Phase 0 context, can verify with targeted reads)
    const taskA = `${enrichedTask}\n\n## Output File\nWrite your FULL plan to: ${planFileA}`;
    const promiseA = runAgent({
      cwd,
      model: MODEL_A,
      systemPrompt: PLANNER_PROMPT_A,
      tools: "read,write,grep,find,ls,bash",
      task: taskA,
      timeoutMs: PHASE_1_TIMEOUT_MS,
      signal,
      onActivity: (activity) => {
        agentState[MODEL_A_LABEL].activity = activity;
        updateWidget();
      },
    });

    await new Promise((r) => setTimeout(r, 1000));

    // Plan B: GPT (gets same Phase 0 context, different perspective)
    const taskB = `${enrichedTask}\n\n## Output File\nWrite your FULL plan to: ${planFileB}`;
    const promiseB = runAgent({
      cwd,
      model: MODEL_B,
      systemPrompt: PLANNER_PROMPT_B,
      tools: "read,write,grep,find,ls,bash",
      task: taskB,
      thinking: "low",
      timeoutMs: PHASE_1_TIMEOUT_MS,
      signal,
      onActivity: (activity) => {
        agentState[MODEL_B_LABEL].activity = activity;
        updateWidget();
      },
    });

    const [resultA, resultB] = await Promise.all([promiseA, promiseB]);

    // Read plans from output files, fall back to stdout capture
    let planA = "";
    try {
      if (fs.existsSync(planFileA)) {
        planA = fs.readFileSync(planFileA, "utf-8").trim();
      }
    } catch {}
    if (!planA) planA = resultA.output || "";

    let planB = "";
    try {
      if (fs.existsSync(planFileB)) {
        planB = fs.readFileSync(planFileB, "utf-8").trim();
      }
    } catch {}
    if (!planB) planB = resultB.output || "";

    // Cleanup temp files
    try { fs.unlinkSync(planFileA); } catch {}
    try { fs.unlinkSync(planFileB); } catch {}
    try { fs.rmdirSync(planDir); } catch {}

    agentState[MODEL_A_LABEL] = {
      status: resultA.exitCode === 0 && planA ? "done" : "error",
      activity: resultA.exitCode === 0 && planA ? `✓ plan ready` : "✗ failed",
      elapsed: Date.now() - startTime,
    };
    agentState[MODEL_B_LABEL] = {
      status: resultB.exitCode === 0 && planB ? "done" : "error",
      activity: resultB.exitCode === 0 && planB ? `✓ plan ready` : "✗ failed",
      elapsed: Date.now() - startTime,
    };
    widgetPhase = "done — review below";
    updateWidget();

    if (timerHandle) {
      clearInterval(timerHandle);
      timerHandle = undefined;
    }
    const t = setTimeout(() => clearWidget(), 8000);
    if (t && typeof t === "object" && "unref" in t) (t as any).unref();

    return {
      planA: planA || "(no output)",
      planB: planB || "(no output)",
      statusA: resultA.exitCode === 0 && planA ? "done" : "error",
      statusB: resultB.exitCode === 0 && planB ? "done" : "error",
    };
  }

  // ── /plan command ───────────────────────────────────────────────

  pi.registerCommand("plan", {
    description: "Generate plans from two models: /plan <task description>",
    handler: async (args, ctx) => {
      if (!args.trim()) {
        ctx.ui.notify("Usage: /plan <task description>", "warning");
        return;
      }

      const result = await runDualPlan(args, ctx.cwd, undefined);
      const message = buildReviewMessage(args, result);
      pi.sendUserMessage(message);
    },
  });

  // ── plan_dual tool ──────────────────────────────────────────────

  pi.registerTool({
    name: "plan_dual",
    label: "Dual Plan",
    description: `Run two planning models in parallel (Opus 4.6 + GPT-5.5) and return both plans for review. Present both to the user, highlight differences, and ask what they want: approve one, merge, modify, or re-plan.`,
    parameters: Type.Object({
      task: Type.String({ description: "Task description to plan for" }),
    }),
    async execute(_id, params, signal, onUpdate, ctx) {
      const result = await runDualPlan(params.task, ctx.cwd, signal, onUpdate);
      const message = buildReviewMessage(params.task, result);
      return { content: [{ type: "text", text: message }], details: {} };
    },
    renderCall(args, theme) {
      const preview = (args.task || "").slice(0, 60);
      return new Text(
        theme.fg("toolTitle", theme.bold("plan_dual ")) + theme.fg("dim", preview),
        0, 0,
      );
    },
    renderResult(result, _opts, theme) {
      const text = result.content[0]?.type === "text" ? result.content[0].text : "";
      const hasA = text.includes("## Plan A");
      const hasB = text.includes("## Plan B");
      const label = hasA && hasB ? "2 plans ready"
        : hasA ? "1 plan (A only)"
        : hasB ? "1 plan (B only)"
        : "plans generated";
      return new Text(
        theme.fg("success", `✓ ${label}`) + theme.fg("dim", " — review & decide"),
        0, 0,
      );
    },
  });

  function buildReviewMessage(
    task: string,
    result: { planA: string; planB: string; statusA: string; statusB: string },
  ): string {
    const parts: string[] = [];
    parts.push(`# Dual Plan: ${task}\n`);
    parts.push(`Two models explored the codebase and produced plans independently. Review both and decide.\n`);

    if (result.statusA === "done") {
      parts.push(`## Plan A (${MODEL_A_LABEL})\n\n${result.planA}\n`);
    } else {
      parts.push(`## Plan A (${MODEL_A_LABEL})\n\n⚠️ Failed to generate.\n`);
    }

    if (result.statusB === "done") {
      parts.push(`## Plan B (${MODEL_B_LABEL})\n\n${result.planB}\n`);
    } else {
      parts.push(`## Plan B (${MODEL_B_LABEL})\n\n⚠️ Failed to generate.\n`);
    }

    parts.push(`---\n`);
    parts.push(`**What would you like to do?**`);
    parts.push(`- Compare both plans and highlight the key differences`);
    parts.push(`- Pick one plan (A or B) as-is`);
    parts.push(`- Merge the best parts of both into a final plan`);
    parts.push(`- Suggest modifications before proceeding`);
    parts.push(`- Approve the final plan and execute it`);

    return parts.join("\n");
  }
}
