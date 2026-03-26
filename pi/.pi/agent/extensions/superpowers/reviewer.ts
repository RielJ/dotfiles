/**
 * Dual Review — Two models review code in parallel
 *
 * /review [context] spawns two reviewers in parallel (Opus 4.6 + GPT 5.4),
 * each writes their full review to a temp file, then feeds BOTH to the
 * main agent for synthesis. Same pattern as /plan.
 *
 * Accepts free-form context just like /plan:
 *   /review                           — auto-detect changes, review everything
 *   /review only the chat feature     — focus review on the chat feature
 *   /review --pr                      — PR mode (branch vs main/master)
 *   /review --pr focus on auth logic  — PR mode with focus
 */

import { spawn } from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import type {
  ExtensionAPI,
  ExtensionContext,
} from "@mariozechner/pi-coding-agent";
import { Text, truncateToWidth } from "@mariozechner/pi-tui";
import { Type } from "@sinclair/typebox";

// ── Module Metadata ─────────────────────────────────────────────────

export const module = {
  id: "dual-review",
  name: "Dual Review",
  description:
    "Two models review code in parallel, main agent synthesizes findings",
  systemPromptWhenEnabled: `### Dual Review
Use /review [context] to run two code reviewers in parallel:
- Claude Opus 4.6 reviews for bugs, security, performance, quality
- GPT 5.4 reviews for architecture, patterns, maintainability
Both reviews are written to files, then synthesized with a comparison.

Usage:
  /review                         — auto-detect changes, review everything
  /review only the chat feature   — focus on a specific area
  /review --pr                    — review current branch as PR
  /review --pr the auth changes   — PR mode with focus context

You can also use the review_dual tool programmatically.`,
};

// ── Config ──────────────────────────────────────────────────────────

const MODEL_A = "anthropic/claude-opus-4-6";
const MODEL_A_LABEL = "Opus 4.6";
const MODEL_B = "openai/gpt-5.4";
const MODEL_B_LABEL = "GPT 5.4";

const REVIEWER_PROMPT = `You are a senior code reviewer. You have access to tools to read files, search code, and run read-only commands.

## Review Strategy
1. Understand what changed (git diff, git status, etc.)
2. Read the modified/relevant files for full context
3. Use grep/find to check for related patterns across the codebase
4. Analyze thoroughly and produce a structured review

## Output Format
Write your review as clean markdown with these sections:

### 🚨 Critical Issues (must fix)
- \`file:line\` — Description and impact

### ⚠️ Warnings (should fix)
- \`file:line\` — Description

### 💡 Suggestions (nice to have)
- \`file:line\` — Improvement idea

### ✅ What Looks Good
- Positive observations

### 📊 Summary
2-3 sentence overall assessment.

Be specific with file paths and line numbers. Focus on actionable feedback.

## CRITICAL OUTPUT INSTRUCTION
Your task will specify an output file path. After completing your review,
you MUST write your complete review to that file using the write tool.
This is how your review gets passed to the synthesis step.`;

// ── Subagent Runner ─────────────────────────────────────────────────

type ActivityCallback = (activity: string) => void;

function runReviewAgent(
  cwd: string,
  model: string,
  task: string,
  signal?: AbortSignal,
  onActivity?: ActivityCallback,
): Promise<{ output: string; exitCode: number }> {
  return new Promise((resolve) => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "pi-review-agent-"));
    const promptFile = path.join(tmpDir, "prompt.md");
    fs.writeFileSync(promptFile, REVIEWER_PROMPT, "utf-8");

    const args = [
      "--mode",
      "json",
      "-p",
      "--no-session",
      "--no-extensions",
      "--model",
      model,
      "--tools",
      "read,write,grep,find,ls,bash",
      "--append-system-prompt",
      promptFile,
      task,
    ];

    const proc = spawn("pi", args, {
      cwd,
      stdio: ["ignore", "pipe", "pipe"],
    });
    const chunks: string[] = [];
    let buffer = "";
    let textLen = 0;
    let toolCount = 0;
    let stderrBuf = "";

    function processLine(line: string) {
      if (!line.trim()) return;
      try {
        const ev = JSON.parse(line);
        const t = ev.type;

        if (onActivity) {
          if (t === "message_update") {
            const ae = ev.assistantMessageEvent;
            if (ae?.type === "thinking_start") onActivity("thinking...");
            else if (ae?.type === "text_start") onActivity("writing...");
            else if (ae?.type === "text_delta") {
              textLen += (ae.delta || "").length;
              const kb = (textLen / 1024).toFixed(1);
              onActivity(`writing... ${kb}k`);
            }
          } else if (t === "tool_execution_start") {
            toolCount++;
            const name = ev.toolName || "tool";
            onActivity(`${name} (${toolCount} calls)`);
          } else if (t === "turn_start") {
            onActivity("processing...");
          }
        }

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
    proc.stderr!.on("data", (chunk: string) => {
      stderrBuf += chunk;
    });

    proc.on("close", (code) => {
      if (buffer.trim()) processLine(buffer);
      try {
        fs.unlinkSync(promptFile);
      } catch {}
      try {
        fs.rmdirSync(tmpDir);
      } catch {}
      const output = chunks.join("\n");
      if (!output && stderrBuf.trim()) {
        resolve({
          output: `(stderr: ${stderrBuf.trim().slice(0, 200)})`,
          exitCode: code ?? 1,
        });
      } else {
        resolve({ output, exitCode: code ?? 1 });
      }
    });

    proc.on("error", (err) => {
      try {
        fs.unlinkSync(promptFile);
      } catch {}
      try {
        fs.rmdirSync(tmpDir);
      } catch {}
      resolve({ output: `Error: ${err.message}`, exitCode: 1 });
    });

    if (signal) {
      const kill = () => proc.kill("SIGTERM");
      if (signal.aborted) kill();
      else signal.addEventListener("abort", kill, { once: true });
    }
  });
}

// ── Context Extraction ──────────────────────────────────────────────

function extractConversationContext(
  ctx: ExtensionContext,
  maxChars = 4000,
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
      if (text.length > 800) text = text.slice(0, 800) + "...";
      if (totalLen + text.length > maxChars) break;
      parts.unshift(text);
      totalLen += text.length;
    }

    return parts.join("\n\n");
  } catch {
    return "";
  }
}

// ── Git Helpers ─────────────────────────────────────────────────────

async function detectReviewTarget(
  pi: ExtensionAPI,
  isPR: boolean,
): Promise<{ target: string; error?: string }> {
  const gitCheck = await pi.exec("git", ["rev-parse", "--git-dir"]);
  if (gitCheck.code !== 0) return { target: "", error: "Not a git repository" };

  const { stdout: branch } = await pi.exec("git", [
    "branch",
    "--show-current",
  ]);
  const branchName = branch.trim();

  // Find base branch
  let base = "main";
  const mainCheck = await pi.exec("git", ["rev-parse", "--verify", "main"]);
  if (mainCheck.code !== 0) {
    const masterCheck = await pi.exec("git", [
      "rev-parse",
      "--verify",
      "master",
    ]);
    if (masterCheck.code === 0) base = "master";
  }

  if (isPR) {
    if (!branchName || ["main", "master", "develop"].includes(branchName)) {
      return { target: "", error: "Switch to a feature branch for PR review" };
    }

    const { stdout: diffStat } = await pi.exec("git", [
      "diff",
      "--stat",
      `${base}...${branchName}`,
    ]);
    const { stdout: changedFiles } = await pi.exec("git", [
      "diff",
      "--name-only",
      `${base}...${branchName}`,
    ]);

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
    const { stdout: changedFiles } = await pi.exec("git", [
      "diff",
      "--name-only",
      `${base}...${branchName}`,
    ]);
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

  // Fall back to working directory changes
  const { stdout: status } = await pi.exec("git", [
    "status",
    "--porcelain",
  ]);
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
    {
      status: "running" | "done" | "error";
      activity: string;
      elapsed: number;
    }
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
                ? theme.fg(
                    "dim",
                    ` ${((Date.now() - startTime) / 1000).toFixed(0)}s`,
                  )
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

  // ── Core: run both reviewers ────────────────────────────────────

  async function runDualReview(
    reviewTarget: string,
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

    // Build enriched task
    let enrichedTask = `## What to Review\n${reviewTarget}`;

    if (userContext) {
      enrichedTask += `\n\n## Focus / Extra Context\n${userContext}`;
    }

    if (currentCtx) {
      const convContext = extractConversationContext(currentCtx);
      if (convContext) {
        enrichedTask += `\n\n## Conversation Context\nThe user has been discussing the following. Use this to inform your review:\n\n${convContext}`;
      }
    }

    // Reset widget
    startTime = Date.now();
    widgetPhase = "reviewing in parallel";
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

    if (currentCtx) {
      timerHandle = setInterval(() => updateWidget(), 1000);
      if (
        timerHandle &&
        typeof timerHandle === "object" &&
        "unref" in timerHandle
      ) {
        (timerHandle as any).unref();
      }
    }

    const taskA = `${enrichedTask}\n\n## Output File\nWrite your FULL review to: ${opusFile}`;
    const taskB = `${enrichedTask}\n\n## Output File\nWrite your FULL review to: ${gptFile}`;

    // Stagger by 1s to avoid pi lock file conflict
    const promiseA = runReviewAgent(cwd, MODEL_A, taskA, signal, (activity) => {
      agentState[MODEL_A_LABEL].activity = activity;
      updateWidget();
    });
    await new Promise((r) => setTimeout(r, 1000));
    const promiseB = runReviewAgent(cwd, MODEL_B, taskB, signal, (activity) => {
      agentState[MODEL_B_LABEL].activity = activity;
      updateWidget();
    });

    const [resultA, resultB] = await Promise.all([promiseA, promiseB]);

    agentState[MODEL_A_LABEL] = {
      status: resultA.exitCode === 0 ? "done" : "error",
      activity: resultA.exitCode === 0 ? "review ready" : "failed",
      elapsed: Date.now() - startTime,
    };
    agentState[MODEL_B_LABEL] = {
      status: resultB.exitCode === 0 ? "done" : "error",
      activity: resultB.exitCode === 0 ? "review ready" : "failed",
      elapsed: Date.now() - startTime,
    };
    widgetPhase = "done — synthesizing";
    updateWidget();

    if (timerHandle) {
      clearInterval(timerHandle);
      timerHandle = undefined;
    }
    const t = setTimeout(() => clearWidget(), 3000);
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
      `Two models reviewed the code independently. Read both full reviews and synthesize.\n`,
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
    parts.push(
      `2. 🔴 **Both agree** — Issues found by BOTH reviewers (high confidence)`,
    );
    parts.push(
      `3. 🟡 **One found** — Issues found by only ONE reviewer (investigate)`,
    );
    parts.push(`4. 🟢 **Positives** — Good things noted by either reviewer`);
    parts.push(`5. 📋 **Final recommendation** — Synthesized action items`);

    return parts.join("\n");
  }

  // ── /review command ─────────────────────────────────────────────

  pi.registerCommand("review", {
    description:
      "Dual code review (Opus 4.6 + GPT 5.4): /review [focus context]",
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
      pi.sendUserMessage(message);
    },
  });

  // ── review_dual tool (programmatic) ─────────────────────────────

  pi.registerTool({
    name: "review_dual",
    label: "Dual Review",
    description:
      "Run two code reviewers in parallel (Opus 4.6 + GPT 5.4) and return both reviews for synthesis.",
    parameters: Type.Object({
      focus: Type.Optional(
        Type.String({
          description:
            "Optional focus area or extra context for the review",
        }),
      ),
      pr: Type.Optional(
        Type.Boolean({
          description:
            "If true, review current branch as PR against main/master",
        }),
      ),
    }),
    async execute(_id, params, signal, _onUpdate, ctx) {
      const { target, error } = await detectReviewTarget(
        pi,
        params.pr ?? false,
      );
      if (error) throw new Error(error);

      const result = await runDualReview(
        target,
        params.focus || "",
        ctx.cwd,
        signal,
      );
      const message = buildSynthesisMessage(params.focus || "", result);
      return { content: [{ type: "text", text: message }] };
    },
    renderCall(args, theme) {
      const preview = (args.focus || "auto-detect changes").slice(0, 60);
      return new Text(
        theme.fg("toolTitle", theme.bold("review_dual ")) +
          theme.fg("dim", preview),
        0,
        0,
      );
    },
    renderResult(result, _opts, theme) {
      const text =
        result.content[0]?.type === "text" ? result.content[0].text : "";
      const hasA = text.includes("Review A");
      const hasB = text.includes("Review B");
      const label =
        hasA && hasB
          ? "2 reviews ready"
          : hasA
            ? "1 review (A only)"
            : hasB
              ? "1 review (B only)"
              : "reviews generated";
      return new Text(
        theme.fg("success", `✓ ${label}`) +
          theme.fg("dim", " — synthesize below"),
        0,
        0,
      );
    },
  });

  // ── Ctrl+Shift+R shortcut ──────────────────────────────────────

  pi.registerShortcut("ctrl+shift+r", {
    description: "Dual code review (Opus 4.6 + GPT 5.4)",
    handler: async () => {
      pi.sendUserMessage("/review", { deliverAs: "followUp" });
    },
  });
}
