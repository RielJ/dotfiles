/**
 * Dual Review — Phase 0 exploration + two models review in parallel
 *
 * /review <context>       — review a specific area, file, or concept
 * /review-changes         — auto-detect git changes and review them
 * /review-changes --pr    — review current branch as PR
 *
 * Pipeline:
 *   Phase 0: Sonnet explorer with gitnexus + code-review-graph (cheap, 90s)
 *   Phase 1: Opus 4.6 + GPT 5.5 review in parallel (both get Phase 0 output)
 *   Main agent synthesizes both reviews.
 */

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import type {
  ExtensionAPI,
  ExtensionContext,
} from "@earendil-works/pi-coding-agent";
import { Text, truncateToWidth } from "@earendil-works/pi-tui";
import { Type } from "@sinclair/typebox";
import { runAgent, runExploration, resolveTaskContext, extractConversationContext, MODELS } from "./_shared.js";

// ── Module Metadata ─────────────────────────────────────────────────

export const module = {
  id: "dual-review",
  name: "Dual Review",
  description:
    "Two models review code in parallel, main agent synthesizes findings",
  systemPromptWhenEnabled: `### Dual Review
Use /review <context> to run a targeted dual code review:
- Opus 4.6 reviews for bugs, security, performance, quality
- GPT 5.5 reviews for architecture, patterns, maintainability
Both reviews are synthesized with a comparison.

Usage:
  /review the auth middleware        — review a specific area
  /review src/api/users.ts           — review a specific file
  /review the database schema design — review a concept/design

Use /review-changes to review git changes:
  /review-changes                    — auto-detect changes, review everything
  /review-changes --pr               — review current branch as PR
  /review-changes --pr the auth logic — PR mode with focus context
  /review-changes only the API layer — focus on a specific area of changes

You can also use the review_dual tool programmatically.`,
};

// ── Config ──────────────────────────────────────────────────────────

const MODEL_A = MODELS.plan;
const MODEL_A_LABEL = "Opus 4.6";
const MODEL_B = MODELS.diversity;
const MODEL_B_LABEL = "GPT 5.5";

const PHASE_0_TIMEOUT_MS = 60_000;  // 60s for exploration
const PHASE_1_TIMEOUT_MS = 360_000; // 6 min for review

// Phase 1 prompts — reviewers get Phase 0 context, do targeted verification, write review

const REVIEWER_PROMPT_A = `You are an expert code reviewer with the rigor of a senior staff engineer.
You receive codebase exploration findings from a prior analysis. Use them as your primary context.

## Workflow
1. Review the exploration findings — they contain changed files, impact analysis, and test coverage.
2. If something critical is missing, use read/grep to verify (max 5 tool calls).
3. Write a thorough code review.

Evaluate against these criteria:
- **Correctness** — Does it work? Are edge cases handled?
- **Architecture** — Does it fit the codebase patterns? Right abstraction level?
- **Performance** — Any N+1 queries, unnecessary allocations, missing optimizations?
- **Security** — Input validation, auth checks, injection risks, exposed secrets?
- **Testing** — Are changes tested? Are tests meaningful?
- **Maintainability** — Clear naming, no magic numbers, good documentation?

## Output Format

### 🚨 Critical Issues (must fix)
- \`file:line\` — Description, impact, and suggested fix

### ⚠️ Warnings (should fix)
- \`file:line\` — Description and recommendation

### 💡 Suggestions (nice to have)
- \`file:line\` — Improvement idea

### ✅ What Looks Good
- Positive observations about well-written code, good patterns, etc.

### 📊 Summary
2-3 sentence overall assessment. Include an explicit verdict:
APPROVE / REQUEST CHANGES / NEEDS DISCUSSION

Be specific with file paths and line numbers. Suggest concrete fixes, not just "this is wrong".

## CRITICAL OUTPUT INSTRUCTION
Your task will specify an output file path. After completing your review,
you MUST write your complete review to that file using the write tool.
Do NOT modify any repository files — only write to the output file.`;

const REVIEWER_PROMPT_B = `You are an expert code reviewer with the rigor of a senior staff engineer.
You receive codebase exploration findings from a prior analysis. Use them as your primary context.

## Workflow
1. Review the exploration findings — they contain changed files, impact analysis, and context.
2. If needed, verify or explore further (max 5 tool calls).
3. Write a thorough code review.

Evaluate against these criteria:
- **Correctness** — Does it work? Are edge cases handled?
- **Architecture** — Does it fit the codebase patterns? Right abstraction level?
- **Performance** — Any N+1 queries, unnecessary allocations, missing optimizations?
- **Security** — Input validation, auth checks, injection risks, exposed secrets?
- **Testing** — Are changes tested? Are tests meaningful?
- **Maintainability** — Clear naming, no magic numbers, good documentation?

## Output Format

### 🚨 Critical Issues (must fix)
- \`file:line\` — Description, impact, and suggested fix

### ⚠️ Warnings (should fix)
- \`file:line\` — Description and recommendation

### 💡 Suggestions (nice to have)
- \`file:line\` — Improvement idea

### ✅ What Looks Good
- Positive observations

### 📊 Summary
2-3 sentence overall assessment. Verdict: APPROVE / REQUEST CHANGES / NEEDS DISCUSSION

## CRITICAL OUTPUT INSTRUCTION
Your task will specify an output file path. After completing your review,
you MUST write your complete review to that file using the write tool.
Do NOT modify any repository files — only write to the output file.`;

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
      "dual-review",
      (_tui, theme) => ({
        render(width: number): string[] {
          const border = theme.fg("border", "─".repeat(width));
          const elapsed = ((Date.now() - startTime) / 1000).toFixed(0);
          const header =
            theme.fg("accent", theme.bold(" 🔍 Dual Review")) +
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
    currentCtx?.ui.setWidget("dual-review", undefined);
  }

  // ── Core: run Phase 0 + both reviewers ──────────────────────────

  async function runDualReview(
    inputReviewTarget: string,
    userContext: string,
    cwd: string,
    signal: AbortSignal | undefined,
  ): Promise<{
    opusFile: string;
    gptFile: string;
    statusA: string;
    statusB: string;
  }> {
    const reviewDir = path.join(os.tmpdir(), `pi-review-${Date.now()}`);
    fs.mkdirSync(reviewDir, { recursive: true });
    const opusFile = path.join(reviewDir, "review-opus.md");
    const gptFile = path.join(reviewDir, "review-gpt.md");

    startTime = Date.now();

    // ── Pre-Phase: Resolve external references ────────────────────
    widgetPhase = "resolving references...";
    updateWidget();

    let reviewTarget = inputReviewTarget;
    const { resolvedTask: resolvedTarget, references } = await resolveTaskContext(cwd, reviewTarget);
    if (references.length > 0) {
      reviewTarget = resolvedTarget;
    }

    // ── Phase 0: Exploration (Sonnet + gitnexus + code-review-graph) ──
    widgetPhase = "Phase 0 — analyzing changes";
    agentState["Explorer"] = {
      status: "running",
      activity: "starting...",
      elapsed: 0,
    };
    updateWidget();

    if (currentCtx && !timerHandle) {
      timerHandle = setInterval(() => updateWidget(), 1000);
      if (timerHandle && typeof timerHandle === "object" && "unref" in timerHandle) {
        (timerHandle as any).unref();
      }
    }

    const explorationFindings = await runExploration({
      cwd,
      task: reviewTarget,
      mode: "review",
      preContext: userContext ? `Focus: ${userContext}` : undefined,
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
        : "✗ no results (reviewers will explore on their own)",
      elapsed: phase0Elapsed,
    };
    updateWidget();

    // ── Phase 1: Both reviewers in parallel ───────────────────────
    widgetPhase = "Phase 1 — reviewing in parallel";
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

    // Review A: Opus (gets Phase 0 context, can verify with targeted reads)
    const taskA = `${enrichedTask}\n\n## Output File\nWrite your FULL review to: ${opusFile}`;
    const promiseA = runAgent({
      cwd,
      model: MODEL_A,
      systemPrompt: REVIEWER_PROMPT_A,
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

    // Review B: GPT (gets same Phase 0 context, different perspective)
    const taskB = `${enrichedTask}\n\n## Output File\nWrite your FULL review to: ${gptFile}`;
    const promiseB = runAgent({
      cwd,
      model: MODEL_B,
      systemPrompt: REVIEWER_PROMPT_B,
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

    agentState[MODEL_A_LABEL] = {
      status: resultA.exitCode === 0 ? "done" : "error",
      activity: resultA.exitCode === 0 ? `✓ review ready` : "✗ failed",
      elapsed: Date.now() - startTime,
    };
    agentState[MODEL_B_LABEL] = {
      status: resultB.exitCode === 0 ? "done" : "error",
      activity: resultB.exitCode === 0 ? `✓ review ready` : "✗ failed",
      elapsed: Date.now() - startTime,
    };
    widgetPhase = "done — synthesizing";
    updateWidget();

    if (timerHandle) {
      clearInterval(timerHandle);
      timerHandle = undefined;
    }
    const t = setTimeout(() => clearWidget(), 8000);
    if (t && typeof t === "object" && "unref" in t) (t as any).unref();

    return {
      opusFile,
      gptFile,
      statusA: resultA.exitCode === 0 ? "done" : "error",
      statusB: resultB.exitCode === 0 ? "done" : "error",
    };
  }

  // ── Build synthesis message ─────────────────────────────────────

  function buildSynthesisMessage(
    userContext: string,
    result: {
      opusFile: string;
      gptFile: string;
      statusA: string;
      statusB: string;
    },
  ): string {
    const parts: string[] = [];
    parts.push(`# Dual Code Review Complete\n`);
    if (userContext) {
      parts.push(`**Focus:** ${userContext}\n`);
    }
    parts.push(
      `Two models reviewed the code independently using shared exploration context. Read both full reviews and synthesize.\n`,
    );

    if (result.statusA === "done") {
      parts.push(
        `## Review A (${MODEL_A_LABEL})\nFull review written to: ${result.opusFile}\n**Read this file now.**\n`,
      );
    } else {
      parts.push(`## Review A (${MODEL_A_LABEL})\n⚠️ Failed to generate.\n`);
    }

    if (result.statusB === "done") {
      parts.push(
        `## Review B (${MODEL_B_LABEL})\nFull review written to: ${result.gptFile}\n**Read this file now.**\n`,
      );
    } else {
      parts.push(`## Review B (${MODEL_B_LABEL})\n⚠️ Failed to generate.\n`);
    }

    parts.push(`---\n`);
    parts.push(`**Synthesize both reviews:**`);
    parts.push(`1. Read both review files above using the read tool`);
    parts.push(`2. 🔴 **Both agree** — Issues found by BOTH reviewers (high confidence)`);
    parts.push(`3. 🟡 **One found** — Issues found by only ONE reviewer (investigate)`);
    parts.push(`4. 🟢 **Positives** — Good things noted by either reviewer`);
    parts.push(`5. 📋 **Final recommendation** — Synthesized action items`);

    return parts.join("\n");
  }

  // ── /review command ─────────────────────────────────────────────

  pi.registerCommand("review", {
    description:
      "Dual code review (Opus 4.6 + GPT 5.5): /review <context to review>",
    handler: async (args, ctx) => {
      const trimmed = (args || "").trim();
      if (!trimmed) {
        ctx.ui.notify(
          "Usage: /review <what to review>\n  e.g. /review the auth middleware\n  e.g. /review src/api/users.ts\n\nFor git changes use /review-changes",
          "warning",
        );
        return;
      }

      const reviewTarget = `Review the following area/topic in the codebase: ${trimmed}\n\nRead the relevant files, understand the code, and produce a thorough review.`;

      const result = await runDualReview(
        reviewTarget,
        trimmed,
        ctx.cwd,
        undefined,
      );

      const message = buildSynthesisMessage(trimmed, result);
      pi.sendUserMessage(message, { deliverAs: "followUp" });
    },
  });

  // ── /review-changes command ─────────────────────────────────────

  pi.registerCommand("review-changes", {
    description:
      "Dual review of git changes (Opus 4.6 + GPT 5.5): /review-changes [--pr] [focus]",
    handler: async (args, ctx) => {
      const trimmed = (args || "").trim();
      const isPR = trimmed.startsWith("--pr");
      const userContext = isPR
        ? trimmed.replace(/^--pr\s*/, "").trim()
        : trimmed;

      const { target, error } = await detectReviewTarget(pi, isPR);
      if (error) {
        ctx.ui.notify(error, "error");
        return;
      }

      const result = await runDualReview(
        target,
        userContext,
        ctx.cwd,
        undefined,
      );

      const message = buildSynthesisMessage(userContext, result);
      pi.sendUserMessage(message, { deliverAs: "followUp" });
    },
  });

  // ── review_dual tool ────────────────────────────────────────────

  pi.registerTool({
    name: "review_dual",
    label: "Dual Review",
    description:
      "Run two code reviewers in parallel (Opus 4.6 + GPT 5.5) and return both reviews for synthesis.",
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
    }),
    async execute(_id, params, signal, _onUpdate, ctx) {
      const { target, error } = await detectReviewTarget(pi, params.pr ?? false);
      if (error) throw new Error(error);

      const result = await runDualReview(
        target,
        params.focus || "",
        ctx.cwd,
        signal,
      );
      const message = buildSynthesisMessage(params.focus || "", result);
      return { content: [{ type: "text", text: message }], details: {} };
    },
    renderCall(args, theme) {
      const preview = (args.focus || "auto-detect changes").slice(0, 60);
      return new Text(
        theme.fg("toolTitle", theme.bold("review_dual ")) + theme.fg("dim", preview),
        0, 0,
      );
    },
    renderResult(result, _opts, theme) {
      const text = result.content[0]?.type === "text" ? result.content[0].text : "";
      const hasA = text.includes("Review A");
      const hasB = text.includes("Review B");
      const label = hasA && hasB ? "2 reviews ready"
        : hasA ? "1 review (A only)"
        : hasB ? "1 review (B only)"
        : "reviews generated";
      return new Text(
        theme.fg("success", `✓ ${label}`) + theme.fg("dim", " — synthesize below"),
        0, 0,
      );
    },
  });

  // ── Ctrl+Shift+R shortcut ──────────────────────────────────────

  pi.registerShortcut("ctrl+shift+r", {
    description: "Dual review of git changes (Opus 4.6 + GPT 5.5)",
    handler: async () => {
      pi.sendUserMessage("/review-changes", { deliverAs: "followUp" });
    },
  });
}
