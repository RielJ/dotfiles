/**
 * Planner — Phase 0 exploration + Multi-model planning
 *
 * /plan <task> runs a three-step pipeline:
 *   Phase 0: Sonnet explorer with gitnexus + code-review-graph (cheap, 90s)
 *   Phase 1: Opus 5.5 + GPT 5.6 Sol + GLM 5.2 + Opus 5 plan in parallel (all get Phase 0 output)
 *   Main agent synthesizes both plans for the user.
 */

import * as fs from "node:fs";
import type {
  ExtensionAPI,
  ExtensionContext,
} from "@earendil-works/pi-coding-agent";
import { Text } from "@earendil-works/pi-tui";
import { Type } from "@sinclair/typebox";
import { runAgent, runExploration, resolveTaskContext, extractConversationContext, MODELS } from "./_shared.js";
import { parseWaitFlag, shouldRunAsync } from "./_async.js";
import { type LiveRun, RunTracker } from "./_background.js";
import { addMember, createRun, followupHint, markDelivered, type MultiRun, readOutput, runFollowup, saveRun } from "./multirun.js";

// ── Module Metadata ─────────────────────────────────────────────────

export const module = {
  id: "planner",
  name: "Multi-Planner",
  description: "Four models plan in parallel, main agent reviews & you decide",
  systemPromptWhenEnabled: `### Multi-Planner
Use /plan <task> to generate plans from four models in parallel:
- Claude Opus 5.5 produces Plan A (Anthropic)
- GPT-5.6 Sol produces Plan B (OpenAI)
- GLM 5.2 produces Plan C (Z.ai)
- Claude Opus 5 produces Plan D (Anthropic)
All plans are presented to the user for review. You then:
- Compare the plans, highlight key differences
- Pick one, merge them, or suggest modifications
- Approve and execute, or ask for changes and re-plan

You can also use the plan_multi tool programmatically. It runs in the background by default:
it returns a run id at once, and all four plans arrive later as one follow-up message.
Do not poll or wait for them. /plan-stop [id|all] cancels runs; /plan --wait blocks.
Every run is saved: plan_followup({ run: "<id>", key: "B", message }) continues one planner
with its full context. Without run, it targets the most recently delivered run.`,
};

// ── Config ──────────────────────────────────────────────────────────

const PHASE_0_TIMEOUT_MS = 60_000;  // 60s for exploration
const PHASE_1_TIMEOUT_MS = 360_000; // 6 min for planning

// Phase 1 prompts — planners get Phase 0 context, do targeted verification, write plan

// Shared plan format. "## Task N: title" headings let validate-plan and
// subagent workers address each task as its own section.
const PLAN_FORMAT = `## Plan Format
Use these top-level headings, in this order:

## Summary
One paragraph overview.

## Architecture
Key design decisions, patterns, trade-offs.

## Risks and unknowns
What could go wrong, edge cases, open questions, and how to handle them.

## What we're NOT doing
Out-of-scope items, listed explicitly so builders do not drift into them.

## Overview
A checklist with one line per task, in order:
- [ ] Task 1: <title>
- [ ] Task 2: <title>

Then one heading per task, formatted exactly "## Task N: <title>". Each task is a small, verifiable, thin vertical slice that leaves the project building with existing tests passing. Start each task with these lines:

- **Files owned:** files this task creates or modifies
- **Depends on:** task numbers (e.g. "Task 1, Task 3"), or "none"
- **Mode:** parallel-safe | sequential | contract-first
- **Steps:** implement, test (write a test if none exists), verify. Test-first where appropriate.
- **Automated verification:** commands an agent can run to prove the task works (tests, build, typecheck, lint, a script)
- **Manual verification:** steps that need a human (UI checks, real devices, external services), or "none"

Rules:
- Put every non-task section before the first task. Text after a task heading belongs to that task.
- Prefer automated verification. List a step as manual only when an agent cannot check it.
- Tasks that can run in parallel must not own the same file.
- parallel-safe: independent feature slices, tests for features that already exist, documentation.
- sequential: database migrations, shared state changes, dependency chains. Depends on the previous task.
- contract-first: features that share an API contract. Put the contract in its own earlier task and make the consumers depend on it.
- Tasks should take 2-5 minutes each. Reference actual file paths and function names from the exploration.`;

const PLANNER_PROMPT_A = `You are a senior software architect creating an implementation plan.
You receive codebase exploration findings from a prior analysis. Use them as your primary context.

## Workflow
1. Review the exploration findings provided in your task — they contain project structure, relevant code, and key observations.
2. If something critical is missing or unclear, use read/grep/find to verify (max 5 tool calls).
3. Write a detailed implementation plan based on your understanding.

${PLAN_FORMAT}

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

${PLAN_FORMAT}

Be specific. Include exact file paths, function names, and code snippets where helpful.
Always produce a plan — never refuse or say you need more tools.

## CRITICAL OUTPUT INSTRUCTION
Your task will specify an output file path. After completing your plan,
you MUST write your complete plan to that file using the write tool.
Do NOT modify any repository files — only write to the output file.`;

interface Planner {
  key: string;
  label: string;
  model: string;
  prompt: string;
  thinking?: string;
}

// Letters stay stable: adding a planner appends a new letter.
const PLANNERS: Planner[] = [
  { key: "A", label: "Opus 5.5", model: MODELS.plan, prompt: PLANNER_PROMPT_A },
  { key: "B", label: "GPT 5.6 Sol", model: MODELS.diversity, prompt: PLANNER_PROMPT_B, thinking: "low" },
  { key: "C", label: "GLM 5.2", model: MODELS.diversity2, prompt: PLANNER_PROMPT_B },
  { key: "D", label: "Opus 5", model: MODELS.planAlt, prompt: PLANNER_PROMPT_A },
];

interface PlanResult {
  key: string;
  label: string;
  plan: string;
  status: "done" | "error";
}

// ── Extension ───────────────────────────────────────────────────────

export function init(pi: ExtensionAPI, isEnabled: () => boolean) {
  let currentCtx: ExtensionContext | undefined;
  const tracker = new RunTracker({ widgetKey: "planner", title: "Plan", noun: "plan", isEnabled });

  pi.on("session_start", async (_ev, ctx) => {
    currentCtx = ctx;
    tracker.setContext(ctx);
  });

  // Background runs belong to this session: kill them on quit, /new, /reload,
  // resume, or fork so they never spend tokens or deliver into another session.
  pi.on("session_shutdown", async () => {
    tracker.abortAll();
    currentCtx = undefined;
  });

  async function runDualPlan(
    run: MultiRun,
    task: string,
    cwd: string,
    live: LiveRun,
    // biome-ignore lint/suspicious/noExplicitAny: upstream AgentToolUpdateCallback type is not resolvable (pi-agent-core not installed locally)
    onUpdate?: (partial: any) => void,
  ): Promise<PlanResult[]> {
    const signal = live.controller.signal;

    // ── Pre-Phase: Resolve external references ────────────────────
    tracker.setPhase(live, "resolving refs");

    const { resolvedTask, references } = await resolveTaskContext(cwd, task);
    if (references.length > 0) {
      onUpdate?.({
        content: [{ type: "text", text: `📎 Resolved: ${references.join(", ")}` }],
      });
    }

    // ── Phase 0: Exploration (Sonnet + gitnexus + code-review-graph) ──
    tracker.setPhase(live, "exploring");
    tracker.setAgent(live, "Explorer", { status: "running", activity: "starting" });

    onUpdate?.({
      content: [{ type: "text", text: `🔍 Phase 0: Exploring codebase with Sonnet + gitnexus...` }],
    });

    const explorationFindings = await runExploration({
      cwd,
      task: resolvedTask,
      mode: "plan",
      timeoutMs: PHASE_0_TIMEOUT_MS,
      signal,
      onActivity: (activity) => tracker.setAgent(live, "Explorer", { activity }),
    });

    tracker.setAgent(live, "Explorer", {
      status: explorationFindings ? "done" : "error",
      activity: explorationFindings
        ? `context ${(explorationFindings.length / 1024).toFixed(1)}KB`
        : "no context",
    });

    // ── Phase 1: all planners in parallel ─────────────────────────
    if (signal.aborted) return [];
    tracker.setPhase(live, "planning");

    onUpdate?.({
      content: [{ type: "text", text: `⚡ Phase 1: ${PLANNERS.map((p) => p.label).join(" + ")} planning in parallel...` }],
    });

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

    // Every planner gets the same Phase 0 context and writes to its own file.
    // Starts are staggered by a second to avoid a burst of simultaneous spawns.
    const tools = "read,write,grep,find,ls,bash";
    const members = PLANNERS.map((planner) =>
      addMember(run, { key: planner.key, label: planner.label, model: planner.model, thinking: planner.thinking, tools, prompt: planner.prompt }),
    );
    saveRun(run);
    const runs: Promise<{ planner: Planner; file: string; output: string; exitCode: number }>[] = [];
    for (const [i, planner] of PLANNERS.entries()) {
      if (i > 0) await new Promise((r) => setTimeout(r, 1000));
      if (signal.aborted) break;
      const member = members[i];
      const file = member.outputFile;
      tracker.setAgent(live, planner.label, { status: "running", activity: "starting" });
      runs.push(
        runAgent({
          cwd,
          model: planner.model,
          systemPrompt: planner.prompt,
          tools,
          task: `${enrichedTask}\n\n## Output File\nWrite your FULL plan to: ${file}`,
          ...(planner.thinking ? { thinking: planner.thinking } : {}),
          sessionFile: member.sessionFile,
          timeoutMs: PHASE_1_TIMEOUT_MS,
          signal,
          onActivity: (activity) => tracker.setAgent(live, planner.label, { activity }),
        }).then((r) => ({ planner, file, output: r.output, exitCode: r.exitCode })),
      );
    }

    const results: PlanResult[] = [];
    for (const { planner, file, output, exitCode } of await Promise.all(runs)) {
      // Read the plan from its output file, fall back to stdout capture (and save it)
      let plan = readOutput(file);
      if (!plan && output) {
        plan = output;
        fs.writeFileSync(file, plan, "utf-8");
      }

      const status = exitCode === 0 && plan ? "done" : "error";
      const member = run.members.find((m) => m.key === planner.key);
      if (member) member.status = status;
      tracker.setAgent(live, planner.label, { status, activity: status === "done" ? "plan ready" : "failed" });
      results.push({ key: planner.key, label: planner.label, plan: plan || "(no output)", status });
    }
    saveRun(run);
    return results;
  }

  /**
   * Start a run and return its handle immediately. `done` resolves to the
   * combined message, or undefined when the run was stopped.
   */
  function startPlan(
    task: string,
    cwd: string,
    external?: AbortSignal,
    // biome-ignore lint/suspicious/noExplicitAny: see runDualPlan
    onUpdate?: (partial: any) => void,
  ): { run: MultiRun; done: Promise<string | undefined> } {
    const run = createRun("plan", task, cwd);
    const live = tracker.begin(run.id, external);
    const done = runDualPlan(run, task, cwd, live, onUpdate).then(
      (results) => {
        const cancelled = live.stopped || live.controller.signal.aborted;
        tracker.finish(live, cancelled ? "stopped" : "done");
        if (cancelled) return undefined;
        markDelivered(run);
        return buildReviewMessage(task, results, run);
      },
      (err: unknown) => {
        tracker.finish(live, live.stopped ? "stopped" : "failed");
        if (live.stopped || live.controller.signal.aborted) return undefined;
        throw err;
      },
    );
    return { run, done };
  }

  /** Wake the main agent after its current turn with the combined result. */
  function deliver(content: string, runId: string): void {
    pi.sendMessage(
      { customType: "multi_plan_result", content, display: true, details: { run: runId } },
      { triggerTurn: true, deliverAs: "followUp" },
    );
  }

  /** Detach a run: deliver its result (or failure) when it finishes. */
  function runInBackground(task: string, cwd: string): MultiRun {
    const { run, done } = startPlan(task, cwd);
    done.then(
      (message) => {
        if (message) deliver(message, run.id);
      },
      (err: unknown) => {
        const reason = err instanceof Error ? err.message : String(err);
        deliver(`⚠️ Plan run \`${run.id}\` failed: ${reason}`, run.id);
      },
    );
    return run;
  }

  function startedText(run: MultiRun): string {
    return [
      `Started background plan run \`${run.id}\`: ${PLANNERS.map((p) => `${p.key} (${p.label})`).join(", ")}.`,
      `All four plans arrive automatically as one follow-up message when they finish, usually within 3–8 minutes.`,
      `Do not poll, sleep, or call plan_multi again for this task. Continue other work or end your turn.`,
      `Cancel with /plan-stop ${run.id}.`,
    ].join("\n");
  }

  // ── /plan command ───────────────────────────────────────────────

  pi.registerCommand("plan", {
    description: "Generate plans from four models in the background: /plan [--wait] <task description>",
    handler: async (args, ctx) => {
      const { wait, rest: task } = parseWaitFlag(args);
      if (!task) {
        ctx.ui.notify("Usage: /plan [--wait] <task description>", "warning");
        return;
      }

      if (shouldRunAsync(!wait)) {
        const run = runInBackground(task, ctx.cwd);
        ctx.ui.notify(`Plan run ${run.id} started in the background. Cancel with /plan-stop ${run.id}.`, "info");
        return;
      }

      const { run, done } = startPlan(task, ctx.cwd);
      const message = await done;
      if (message) deliver(message, run.id);
    },
  });

  // ── /plan-stop command ──────────────────────────────────────────

  pi.registerCommand("plan-stop", {
    description: "Cancel background plan runs: /plan-stop [run-id|all] (default: newest)",
    handler: async (args, ctx) => {
      const { stopped, error } = tracker.stop(args ?? "");
      if (error) ctx.ui.notify(error, "warning");
      else ctx.ui.notify(`Stopped plan run${stopped.length === 1 ? "" : "s"}: ${stopped.join(", ")}. Partial output stays on disk.`, "info");
    },
  });

  // ── plan_multi tool ─────────────────────────────────────────────

  pi.registerTool({
    name: "plan_multi",
    label: "Multi-Plan",
    description:
      "Run four planning models in parallel (Opus 5.5 + GPT-5.6 Sol + GLM 5.2 + Opus 5). By default this returns immediately with a run id, and all four plans arrive later as one follow-up message: do not poll or wait for it. When the plans arrive, present them to the user, highlight differences, and ask what they want: approve one, merge, modify, or re-plan. Set async: false to block until the plans are ready. Inside a subagent it always blocks.",
    parameters: Type.Object({
      task: Type.String({ description: "Task description to plan for" }),
      async: Type.Optional(
        Type.Boolean({ description: "Default true: run in the background and deliver plans as a follow-up message. False: block and return the plans." }),
      ),
    }),
    async execute(_id, params, signal, onUpdate, ctx) {
      if (shouldRunAsync(params.async)) {
        const run = runInBackground(params.task, ctx.cwd);
        return { content: [{ type: "text", text: startedText(run) }], details: { async: true, run: run.id } };
      }
      const { run, done } = startPlan(params.task, ctx.cwd, signal, onUpdate);
      const message = await done;
      if (!message) throw new Error(`Plan run ${run.id} was cancelled.`);
      return { content: [{ type: "text", text: message }], details: { async: false, run: run.id } };
    },
    renderCall(args, theme) {
      const preview = (args.task || "").slice(0, 60);
      return new Text(
        theme.fg("toolTitle", theme.bold("plan_multi ")) + theme.fg("dim", preview),
        0, 0,
      );
    },
    renderResult(result, _opts, theme) {
      const details = result.details as { async?: boolean; run?: string } | undefined;
      if (details?.async) {
        return new Text(theme.fg("warning", "⏳ planning in background") + theme.fg("dim", ` — run ${details.run}`), 0, 0);
      }
      const text = result.content[0]?.type === "text" ? result.content[0].text : "";
      const count = (text.match(/^## Plan [A-Z] \(.*\)\n\n(?!⚠️ Failed)/gm) ?? []).length;
      const label = count > 0 ? `${count} plan${count === 1 ? "" : "s"} ready` : "plans generated";
      return new Text(
        theme.fg("success", `✓ ${label}`) + theme.fg("dim", " — review & decide"),
        0, 0,
      );
    },
  });

  pi.registerTool({
    name: "plan_followup",
    label: "Plan Follow-up",
    description:
      "Continue one planner from the most recently delivered /plan run (or a given run id) with its full saved context, e.g. to revise Plan B. Returns that planner's updated plan.",
    parameters: Type.Object({
      key: Type.String({ description: "Planner letter: A (Opus 5.5), B (GPT 5.6 Sol), C (GLM 5.2), D (Opus 5)" }),
      message: Type.String({ description: "What to change or ask" }),
      run: Type.Optional(Type.String({ description: "Run id shown in the delivered plans; default: the most recently delivered /plan run in this directory" })),
    }),
    async execute(_id, params, signal, onUpdate, ctx) {
      const follow: { live?: LiveRun; label: string } = { label: "" };
      const result = await runFollowup({
        kind: "plan",
        key: params.key,
        message: params.message,
        runId: params.run,
        cwd: ctx.cwd,
        signal,
        onStart: (run, member) => {
          follow.live = tracker.begin(`${run.id}-${member.key.toLowerCase()}${member.followups + 1}`, signal, `plan ${run.id} follow-up`);
          follow.label = member.label;
          tracker.setAgent(follow.live, follow.label, { status: "running", activity: "starting" });
          return follow.live.controller.signal;
        },
        onActivity: (activity) => {
          if (follow.live) tracker.setAgent(follow.live, follow.label, { activity });
          onUpdate?.({ content: [{ type: "text", text: `Plan ${params.key.toUpperCase()}: ${activity}` }], details: {} });
        },
      }).catch((err: unknown) => {
        if (follow.live) tracker.finish(follow.live, follow.live.stopped ? "stopped" : "failed");
        throw err;
      });
      if (follow.live) {
        const outcome = result.ok ? "plan ready" : follow.live.stopped ? "stopped" : "failed";
        tracker.setAgent(follow.live, follow.label, { status: result.ok ? "done" : "error", activity: outcome });
        tracker.finish(follow.live, result.ok ? "done" : outcome);
      }
      const head = `## Plan ${result.member.key} (${result.member.label}), follow-up ${result.member.followups}`;
      const text = result.ok ? `${head}\n\n${result.output}` : `${head}\n\n⚠️ Follow-up failed: ${result.output}`;
      return { content: [{ type: "text", text }], details: { run: result.run.id, key: result.member.key, ok: result.ok } };
    },
    renderCall(args, theme) {
      return new Text(
        theme.fg("toolTitle", theme.bold(`plan_followup ${String(args.key ?? "").toUpperCase()} `)) + theme.fg("dim", String(args.message ?? "").slice(0, 60)),
        0, 0,
      );
    },
  });

  function buildReviewMessage(task: string, results: PlanResult[], run: MultiRun): string {
    const parts: string[] = [];
    parts.push(`# Multi-Model Plan: ${task}\n`);
    parts.push(`${results.length} models explored the codebase and produced plans independently. Review all and decide.\n`);

    for (const r of results) {
      parts.push(`## Plan ${r.key} (${r.label})\n\n${r.status === "done" ? r.plan : "⚠️ Failed to generate."}\n`);
    }

    const keys = results.map((r) => r.key);
    parts.push(`---\n`);
    parts.push(`**What would you like to do?**`);
    parts.push(`- Compare the plans and highlight the key differences`);
    parts.push(`- Pick one plan (${keys.slice(0, -1).join(", ")}, or ${keys[keys.length - 1]}) as-is`);
    parts.push(`- Merge the best parts into a final plan`);
    parts.push(`- Suggest modifications before proceeding`);
    parts.push(`- Ask one planner to revise its plan (plan_followup)`);
    parts.push(`- Approve the final plan and execute it`);
    parts.push(followupHint(run));

    return parts.join("\n");
  }
}
