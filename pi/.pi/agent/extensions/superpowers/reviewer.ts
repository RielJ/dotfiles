/**
 * Multi-Reviewer — Phase 0 exploration + four models review in parallel
 *
 * /review <context>       — review a specific area, file, or concept
 * /review-changes         — auto-detect git changes and review them
 * /review-changes --pr    — review current branch as PR
 *
 * Pipeline:
 *   Phase 0: Sonnet explorer with gitnexus + code-review-graph (cheap, 90s)
 *   Phase 1: Opus 5.5 + GPT 5.6 Sol + GLM 5.2 + Opus 5 review in parallel (all get Phase 0 output)
 *   Main agent synthesizes both reviews.
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
  id: "dual-review",
  name: "Multi-Reviewer",
  description:
    "Four models review code in parallel, main agent synthesizes findings",
  systemPromptWhenEnabled: `### Multi-Reviewer
Use /review <context> to run a targeted multi-model code review:
- Claude Opus 5.5, GPT 5.6 Sol, GLM 5.2, and Claude Opus 5 review independently
- Each reports only merge-blocking problems (file:line, why it's wrong, how to show it fails)
  plus anything it could not confirm and where it looked
All reviews are synthesized with a comparison.

Usage:
  /review the auth middleware        — review a specific area
  /review src/api/users.ts           — review a specific file
  /review the database schema design — review a concept/design

Use /review-changes to review git changes:
  /review-changes                    — auto-detect changes, review everything
  /review-changes --pr               — review current branch as PR
  /review-changes --pr the auth logic — PR mode with focus context
  /review-changes only the API layer — focus on a specific area of changes

You can also use the review_multi tool programmatically. It runs in the background by default:
it returns a run id at once, and all four reviews arrive later as one follow-up message.
Do not poll or wait for them. /review-stop [id|all] cancels runs; add --wait to block.
Every run is saved: review_followup({ run: "<id>", key: "D", message }) continues one reviewer
with its full context. Without run, it targets the most recently delivered run.`,
};

// ── Config ──────────────────────────────────────────────────────────

const PHASE_0_TIMEOUT_MS = 60_000;  // 60s for exploration
const PHASE_1_TIMEOUT_MS = 360_000; // 6 min for review

// Phase 1 prompts — reviewers get Phase 0 context, do targeted verification, write review

const REVIEWER_PROMPT_A = `You are an expert code reviewer with the rigor of a senior staff engineer.
You receive codebase exploration findings from a prior analysis. Use them as your primary context.

## Workflow
1. Review the exploration findings — they contain changed files, impact analysis, and test coverage.
2. If something critical is missing, use read/grep to verify (max 5 tool calls).
3. Write a code review limited to merge-blocking problems.

Review only for problems you would block the merge for: bugs, regressions, security holes (input validation, auth, injection, exposed secrets), data loss, serious performance problems (N+1 queries, unbounded work), broken builds or tests, and missing tests for risky behavior. Skip style preferences, naming nits, and nice-to-haves.

## Output Format

### Blocking issues
For each issue:
- \`file:line\` — why it is wrong
- How to show it fails: a failing test, an input, or a command that demonstrates the problem
- Suggested fix
Write "None" if there are none.

### Unconfirmed
Anything you suspected but could not confirm, and where you looked (files, commands, searches).

### Verdict
APPROVE or REQUEST CHANGES, with one sentence explaining why.

Be specific with file paths and line numbers.

## CRITICAL OUTPUT INSTRUCTION
Your task will specify an output file path. After completing your review,
you MUST write your complete review to that file using the write tool.
Do NOT modify any repository files — only write to the output file.`;

const REVIEWER_PROMPT_B = `You are an expert code reviewer with the rigor of a senior staff engineer.
You receive codebase exploration findings from a prior analysis. Use them as your primary context.

## Workflow
1. Review the exploration findings — they contain changed files, impact analysis, and context.
2. If needed, verify or explore further (max 5 tool calls).
3. Write a code review limited to merge-blocking problems.

Review only for problems you would block the merge for: bugs, regressions, security holes (input validation, auth, injection, exposed secrets), data loss, serious performance problems (N+1 queries, unbounded work), broken builds or tests, and missing tests for risky behavior. Skip style preferences, naming nits, and nice-to-haves.

## Output Format

### Blocking issues
For each issue:
- \`file:line\` — why it is wrong
- How to show it fails: a failing test, an input, or a command that demonstrates the problem
- Suggested fix
Write "None" if there are none.

### Unconfirmed
Anything you suspected but could not confirm, and where you looked (files, commands, searches).

### Verdict
APPROVE or REQUEST CHANGES, with one sentence explaining why.

Be specific with file paths and line numbers.

## CRITICAL OUTPUT INSTRUCTION
Your task will specify an output file path. After completing your review,
you MUST write your complete review to that file using the write tool.
Do NOT modify any repository files — only write to the output file.`;

interface Reviewer {
  key: string;
  label: string;
  model: string;
  prompt: string;
  thinking?: string;
}

// Letters stay stable: adding a reviewer appends a new letter.
const REVIEWERS: Reviewer[] = [
  { key: "A", label: "Opus 5.5", model: MODELS.plan, prompt: REVIEWER_PROMPT_A },
  { key: "B", label: "GPT 5.6 Sol", model: MODELS.diversity, prompt: REVIEWER_PROMPT_B, thinking: "low" },
  { key: "C", label: "GLM 5.2", model: MODELS.diversity2, prompt: REVIEWER_PROMPT_B },
  { key: "D", label: "Opus 5", model: MODELS.planAlt, prompt: REVIEWER_PROMPT_A },
];

/** One reviewer's outcome. The review text stays in `file` for the main agent to read. */
interface ReviewResult {
  key: string;
  label: string;
  file: string;
  status: "done" | "error";
}

// ── Git Helpers ─────────────────────────────────────────────────────

async function detectReviewTarget(
  pi: ExtensionAPI,
  isPR: boolean,
): Promise<{ target: string; error?: string }> {
  const gitCheck = await pi.exec("git", ["rev-parse", "--git-dir"]);
  if (gitCheck.code !== 0) return { target: "", error: "Not a git repository" };

  const { stdout: branch } = await pi.exec("git", ["branch", "--show-current"]);
  const branchName = branch.trim();

  let base = "main";
  const mainCheck = await pi.exec("git", ["rev-parse", "--verify", "main"]);
  if (mainCheck.code !== 0) {
    const masterCheck = await pi.exec("git", ["rev-parse", "--verify", "master"]);
    if (masterCheck.code === 0) base = "master";
  }

  if (isPR) {
    if (!branchName || ["main", "master", "develop"].includes(branchName)) {
      return { target: "", error: "Switch to a feature branch for PR review" };
    }

    const { stdout: diffStat } = await pi.exec("git", ["diff", "--stat", `${base}...${branchName}`]);
    const { stdout: changedFiles } = await pi.exec("git", ["diff", "--name-only", `${base}...${branchName}`]);

    return {
      target: [
        `PR review: branch '${branchName}' → '${base}'`,
        `Changed files:\n${changedFiles.trim()}`,
        `Diff summary:\n${diffStat.trim()}`,
        `Use: git diff ${base}...${branchName}`,
        `Read each changed file for full context.`,
      ].join("\n\n"),
    };
  }

  // Auto-detect
  if (branchName && !["main", "master", "develop"].includes(branchName)) {
    const { stdout: changedFiles } = await pi.exec("git", ["diff", "--name-only", `${base}...${branchName}`]);
    if (changedFiles.trim()) {
      return {
        target: [
          `Branch '${branchName}' changes vs '${base}'`,
          `Changed files:\n${changedFiles.trim()}`,
          `Use: git diff ${base}...${branchName}`,
          `Read each changed file for full context.`,
        ].join("\n\n"),
      };
    }
  }

  const { stdout: status } = await pi.exec("git", ["status", "--porcelain"]);
  if (!status.trim()) {
    return { target: "", error: "No changes to review" };
  }

  return {
    target: [
      `Working directory changes:`,
      `${status.trim()}`,
      `Use: git diff and git diff --staged`,
    ].join("\n\n"),
  };
}

// ── Extension ───────────────────────────────────────────────────────

export function init(pi: ExtensionAPI, isEnabled: () => boolean) {
  let currentCtx: ExtensionContext | undefined;
  const tracker = new RunTracker({ widgetKey: "dual-review", title: "Review", noun: "review", isEnabled });

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

  // ── Core: run Phase 0 + all reviewers ───────────────────────────

  async function runDualReview(
    run: MultiRun,
    inputReviewTarget: string,
    userContext: string,
    cwd: string,
    live: LiveRun,
  ): Promise<ReviewResult[]> {
    const signal = live.controller.signal;

    // ── Pre-Phase: Resolve external references ────────────────────
    tracker.setPhase(live, "resolving refs");

    let reviewTarget = inputReviewTarget;
    const { resolvedTask: resolvedTarget, references } = await resolveTaskContext(cwd, reviewTarget);
    if (references.length > 0) {
      reviewTarget = resolvedTarget;
    }

    // ── Phase 0: Exploration (Sonnet + gitnexus + code-review-graph) ──
    tracker.setPhase(live, "exploring");
    tracker.setAgent(live, "Explorer", { status: "running", activity: "starting" });

    const explorationFindings = await runExploration({
      cwd,
      task: reviewTarget,
      mode: "review",
      preContext: userContext ? `Focus: ${userContext}` : undefined,
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

    // ── Phase 1: all reviewers in parallel ────────────────────────
    if (signal.aborted) return [];
    tracker.setPhase(live, "reviewing");

    // Build enriched task with Phase 0 findings
    let enrichedTask = `## What to Review\n${reviewTarget}`;

    if (explorationFindings) {
      enrichedTask += `\n\n## Codebase Exploration Findings (Phase 0)\n\n${explorationFindings}`;
    }

    if (userContext) {
      enrichedTask += `\n\n## Focus / Extra Context\n${userContext}`;
    }

    if (currentCtx) {
      const convContext = extractConversationContext(currentCtx);
      if (convContext) {
        enrichedTask += `\n\n## Conversation Context\nThe user has been discussing the following. Use this to inform your review:\n\n${convContext}`;
      }
    }

    // Every reviewer gets the same Phase 0 context and writes to its own file.
    // Starts are staggered by a second to avoid a burst of simultaneous spawns.
    const tools = "read,write,grep,find,ls,bash";
    const members = REVIEWERS.map((reviewer) =>
      addMember(run, { key: reviewer.key, label: reviewer.label, model: reviewer.model, thinking: reviewer.thinking, tools, prompt: reviewer.prompt }),
    );
    saveRun(run);
    const runs: Promise<ReviewResult>[] = [];
    for (const [i, reviewer] of REVIEWERS.entries()) {
      if (i > 0) await new Promise((r) => setTimeout(r, 1000));
      if (signal.aborted) break;
      const member = members[i];
      const file = member.outputFile;
      tracker.setAgent(live, reviewer.label, { status: "running", activity: "starting" });
      runs.push(
        runAgent({
          cwd,
          model: reviewer.model,
          systemPrompt: reviewer.prompt,
          tools,
          task: `${enrichedTask}\n\n## Output File\nWrite your FULL review to: ${file}`,
          ...(reviewer.thinking ? { thinking: reviewer.thinking } : {}),
          sessionFile: member.sessionFile,
          timeoutMs: PHASE_1_TIMEOUT_MS,
          signal,
          onActivity: (activity) => tracker.setAgent(live, reviewer.label, { activity }),
        }).then((r) => {
          // Keep stdout as the review when the model didn't write the file.
          if (!readOutput(file) && r.output) fs.writeFileSync(file, r.output, "utf-8");
          const status = r.exitCode === 0 && readOutput(file) ? "done" : "error";
          member.status = status;
          tracker.setAgent(live, reviewer.label, { status, activity: status === "done" ? "review ready" : "failed" });
          return { key: reviewer.key, label: reviewer.label, file, status };
        }),
      );
    }

    const results = await Promise.all(runs);
    saveRun(run);
    return results;
  }

  /**
   * Start a run and return its handle immediately. `done` resolves to the
   * combined message, or undefined when the run was stopped.
   */
  function startReview(
    reviewTarget: string,
    userContext: string,
    cwd: string,
    external?: AbortSignal,
  ): { run: MultiRun; done: Promise<string | undefined> } {
    // Every reviewer's session and review are saved so review_followup can resume one later.
    const run = createRun("review", userContext || reviewTarget.slice(0, 200), cwd);
    const live = tracker.begin(run.id, external);
    const done = runDualReview(run, reviewTarget, userContext, cwd, live).then(
      (results) => {
        const cancelled = live.stopped || live.controller.signal.aborted;
        tracker.finish(live, cancelled ? "stopped" : "done");
        if (cancelled) return undefined;
        markDelivered(run);
        return buildSynthesisMessage(userContext, results, run);
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
      { customType: "multi_review_result", content, display: true, details: { run: runId } },
      { triggerTurn: true, deliverAs: "followUp" },
    );
  }

  /** Detach a run: deliver its result (or failure) when it finishes. */
  function runInBackground(reviewTarget: string, userContext: string, cwd: string): MultiRun {
    const { run, done } = startReview(reviewTarget, userContext, cwd);
    done.then(
      (message) => {
        if (message) deliver(message, run.id);
      },
      (err: unknown) => {
        const reason = err instanceof Error ? err.message : String(err);
        deliver(`⚠️ Review run \`${run.id}\` failed: ${reason}`, run.id);
      },
    );
    return run;
  }

  /** Command entry: background by default, blocking with --wait. */
  async function launchFromCommand(
    ctx: ExtensionContext,
    wait: boolean,
    reviewTarget: string,
    userContext: string,
  ): Promise<void> {
    if (shouldRunAsync(!wait)) {
      const run = runInBackground(reviewTarget, userContext, ctx.cwd);
      ctx.ui.notify(`Review run ${run.id} started in the background. Cancel with /review-stop ${run.id}.`, "info");
      return;
    }
    const { run, done } = startReview(reviewTarget, userContext, ctx.cwd);
    const message = await done;
    if (message) deliver(message, run.id);
  }

  function startedText(run: MultiRun): string {
    return [
      `Started background review run \`${run.id}\`: ${REVIEWERS.map((r) => `${r.key} (${r.label})`).join(", ")}.`,
      `All four reviews arrive automatically as one follow-up message when they finish, usually within 3–8 minutes.`,
      `Do not poll, sleep, or call review_multi again for this target. Continue other work or end your turn.`,
      `Cancel with /review-stop ${run.id}.`,
    ].join("\n");
  }

  // ── Build synthesis message ─────────────────────────────────────

  function buildSynthesisMessage(userContext: string, results: ReviewResult[], run: MultiRun): string {
    const parts: string[] = [];
    parts.push(`# Multi-Model Code Review Complete\n`);
    if (userContext) {
      parts.push(`**Focus:** ${userContext}\n`);
    }
    parts.push(
      `${results.length} models reviewed the code independently using shared exploration context. Read all full reviews and synthesize.\n`,
    );

    for (const r of results) {
      parts.push(
        r.status === "done"
          ? `## Review ${r.key} (${r.label})\nFull review written to: ${r.file}\n**Read this file now.**\n`
          : `## Review ${r.key} (${r.label})\n⚠️ Failed to generate.\n`,
      );
    }

    parts.push(`---\n`);
    parts.push(`**Synthesize all reviews:**`);
    parts.push(`1. Read all review files above using the read tool`);
    parts.push(`2. Check each reported issue against the code before accepting it. Drop issues you can refute and say why.`);
    parts.push(`3. 🔴 **Consensus blockers** — Merge-blocking issues found by MULTIPLE reviewers (file:line, why, how to show it fails)`);
    parts.push(`4. 🟡 **Single-reviewer blockers** — Issues found by only ONE reviewer, marked confirmed or unconfirmed after your check`);
    parts.push(`5. ❓ **Unconfirmed** — What nobody could confirm, and where reviewers looked`);
    parts.push(`6. 📋 **Verdict** — APPROVE or REQUEST CHANGES, with the blocking fixes required`);
    parts.push(`7. To ask one reviewer to clarify or re-check a finding, use review_followup.`);
    parts.push(followupHint(run));

    return parts.join("\n");
  }

  // ── /review command ─────────────────────────────────────────────

  pi.registerCommand("review", {
    description:
      "Multi-model code review in the background (Claude Opus 5.5 + GPT 5.6 Sol + GLM 5.2 + Opus 5): /review [--wait] <context to review>",
    handler: async (args, ctx) => {
      const { wait, rest: trimmed } = parseWaitFlag(args || "");
      if (!trimmed) {
        ctx.ui.notify(
          "Usage: /review [--wait] <what to review>\n  e.g. /review the auth middleware\n  e.g. /review src/api/users.ts\n\nFor git changes use /review-changes",
          "warning",
        );
        return;
      }

      const reviewTarget = `Review the following area/topic in the codebase: ${trimmed}\n\nRead the relevant files, understand the code, and produce a thorough review.`;

      await launchFromCommand(ctx, wait, reviewTarget, trimmed);
    },
  });

  // ── /review-changes command ─────────────────────────────────────

  pi.registerCommand("review-changes", {
    description:
      "Multi-model review of git changes in the background (Claude Opus 5.5 + GPT 5.6 Sol + GLM 5.2 + Opus 5): /review-changes [--wait] [--pr] [focus]",
    handler: async (args, ctx) => {
      const { wait, rest: trimmed } = parseWaitFlag(args || "");
      const isPR = trimmed.startsWith("--pr");
      const userContext = isPR
        ? trimmed.replace(/^--pr\s*/, "").trim()
        : trimmed;

      const { target, error } = await detectReviewTarget(pi, isPR);
      if (error) {
        ctx.ui.notify(error, "error");
        return;
      }

      await launchFromCommand(ctx, wait, target, userContext);
    },
  });

  // ── /review-stop command ────────────────────────────────────────

  pi.registerCommand("review-stop", {
    description: "Cancel background review runs: /review-stop [run-id|all] (default: newest)",
    handler: async (args, ctx) => {
      const { stopped, error } = tracker.stop(args ?? "");
      if (error) ctx.ui.notify(error, "warning");
      else ctx.ui.notify(`Stopped review run${stopped.length === 1 ? "" : "s"}: ${stopped.join(", ")}. Partial output stays on disk.`, "info");
    },
  });

  // ── review_multi tool ─────────────────────────────────────────

  pi.registerTool({
    name: "review_multi",
    label: "Multi-Review",
    description:
      "Run four code reviewers in parallel (Claude Opus 5.5 + GPT 5.6 Sol + GLM 5.2 + Opus 5). By default this returns immediately with a run id, and all four reviews arrive later as one follow-up message: do not poll or wait for it. When they arrive, read and synthesize them. Set async: false to block until the reviews are ready. Inside a subagent it always blocks.",
    parameters: Type.Object({
      focus: Type.Optional(
        Type.String({
          description: "Optional focus area or extra context for the review",
        }),
      ),
      pr: Type.Optional(
        Type.Boolean({
          description: "If true, review current branch as PR against main/master",
        }),
      ),
      async: Type.Optional(
        Type.Boolean({ description: "Default true: run in the background and deliver reviews as a follow-up message. False: block and return the reviews." }),
      ),
    }),
    async execute(_id, params, signal, _onUpdate, ctx) {
      const { target, error } = await detectReviewTarget(pi, params.pr ?? false);
      if (error) throw new Error(error);

      if (shouldRunAsync(params.async)) {
        const run = runInBackground(target, params.focus || "", ctx.cwd);
        return { content: [{ type: "text", text: startedText(run) }], details: { async: true, run: run.id } };
      }
      const { run, done } = startReview(target, params.focus || "", ctx.cwd, signal);
      const message = await done;
      if (!message) throw new Error(`Review run ${run.id} was cancelled.`);
      return { content: [{ type: "text", text: message }], details: { async: false, run: run.id } };
    },
    renderCall(args, theme) {
      const preview = (args.focus || "auto-detect changes").slice(0, 60);
      return new Text(
        theme.fg("toolTitle", theme.bold("review_multi ")) + theme.fg("dim", preview),
        0, 0,
      );
    },
    renderResult(result, _opts, theme) {
      const details = result.details as { async?: boolean; run?: string } | undefined;
      if (details?.async) {
        return new Text(theme.fg("warning", "⏳ reviewing in background") + theme.fg("dim", ` — run ${details.run}`), 0, 0);
      }
      const text = result.content[0]?.type === "text" ? result.content[0].text : "";
      const count = (text.match(/^## Review [A-Z] \(.*\)\nFull review written to:/gm) ?? []).length;
      const label = count > 0 ? `${count} review${count === 1 ? "" : "s"} ready` : "reviews generated";
      return new Text(
        theme.fg("success", `✓ ${label}`) + theme.fg("dim", " — synthesize below"),
        0, 0,
      );
    },
  });

  // ── review_followup tool ──────────────────────────────────────

  pi.registerTool({
    name: "review_followup",
    label: "Review Follow-up",
    description:
      "Continue one reviewer from the most recently delivered /review run (or a given run id) with its full saved context, e.g. to ask Review D to justify or re-check a finding. Returns that reviewer's answer.",
    parameters: Type.Object({
      key: Type.String({ description: "Reviewer letter: A (Opus 5.5), B (GPT 5.6 Sol), C (GLM 5.2), D (Opus 5)" }),
      message: Type.String({ description: "What to ask or re-check" }),
      run: Type.Optional(Type.String({ description: "Run id shown in the delivered reviews; default: the most recently delivered /review run in this directory" })),
    }),
    async execute(_id, params, signal, onUpdate, ctx) {
      const follow: { live?: LiveRun; label: string } = { label: "" };
      const result = await runFollowup({
        kind: "review",
        key: params.key,
        message: params.message,
        runId: params.run,
        cwd: ctx.cwd,
        signal,
        onStart: (run, member) => {
          follow.live = tracker.begin(`${run.id}-${member.key.toLowerCase()}${member.followups + 1}`, signal, `review ${run.id} follow-up`);
          follow.label = member.label;
          tracker.setAgent(follow.live, follow.label, { status: "running", activity: "starting" });
          return follow.live.controller.signal;
        },
        onActivity: (activity) => {
          if (follow.live) tracker.setAgent(follow.live, follow.label, { activity });
          onUpdate?.({ content: [{ type: "text", text: `Review ${params.key.toUpperCase()}: ${activity}` }], details: {} });
        },
      }).catch((err: unknown) => {
        if (follow.live) tracker.finish(follow.live, follow.live.stopped ? "stopped" : "failed");
        throw err;
      });
      if (follow.live) {
        const outcome = result.ok ? "review ready" : follow.live.stopped ? "stopped" : "failed";
        tracker.setAgent(follow.live, follow.label, { status: result.ok ? "done" : "error", activity: outcome });
        tracker.finish(follow.live, result.ok ? "done" : outcome);
      }
      const head = `## Review ${result.member.key} (${result.member.label}), follow-up ${result.member.followups}`;
      const text = result.ok ? `${head}\n\n${result.output}` : `${head}\n\n⚠️ Follow-up failed: ${result.output}`;
      return { content: [{ type: "text", text }], details: { run: result.run.id, key: result.member.key, ok: result.ok } };
    },
    renderCall(args, theme) {
      return new Text(
        theme.fg("toolTitle", theme.bold(`review_followup ${String(args.key ?? "").toUpperCase()} `)) + theme.fg("dim", String(args.message ?? "").slice(0, 60)),
        0, 0,
      );
    },
  });

  // ── Ctrl+Shift+R shortcut ──────────────────────────────────────

  pi.registerShortcut("ctrl+shift+r", {
    description: "Multi-model review of git changes (Claude Opus 5.5 + GPT 5.6 Sol + GLM 5.2 + Opus 5)",
    handler: async () => {
      pi.sendUserMessage("/review-changes", { deliverAs: "followUp" });
    },
  });
}
