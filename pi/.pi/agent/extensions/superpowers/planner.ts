/**
 * Planner — Dual-model planning fed to main agent for review
 *
 * /plan <task> spawns two planners in parallel (Sonnet + Haiku),
 * then feeds BOTH plans to the main agent for review. The user
 * decides: approve, modify, pick one, or ask for changes.
 *
 * No files saved. No 3rd subagent. The main agent IS the reviewer.
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
  id: "planner",
  name: "Dual Planner",
  description: "Two models plan in parallel, main agent reviews & you decide",
  systemPromptWhenEnabled: `### Dual Planner
Use /plan <task> to generate plans from two models in parallel:
- Opus 4.6 produces Plan A (Anthropic)
- GPT-5.4 produces Plan B (OpenAI)
Both plans are presented to the user for review. You then:
- Compare both plans, highlight key differences
- Pick one, merge them, or suggest modifications
- Approve and execute, or ask for changes and re-plan

You can also use the plan_dual tool programmatically.`,
};

// ── Config ──────────────────────────────────────────────────────────

// Model A: strong reasoning (Opus 4.6)
const MODEL_A = "anthropic/claude-opus-4-6";
const MODEL_A_LABEL = "Opus 4.6";
// Model B: different perspective (OpenAI GPT-5.4)
const MODEL_B = "openai/gpt-5.4";
const MODEL_B_LABEL = "GPT-5.4";

const PLANNER_PROMPT = `You are a senior software architect creating an implementation plan.
You have deep knowledge of software engineering, frameworks, libraries, and best practices.
You do NOT need to search the web — use your existing knowledge to create the plan.

Given a task, produce a detailed plan with:
1. **Summary** — one paragraph overview
2. **Architecture** — key design decisions, patterns, trade-offs
3. **Tasks** — numbered list of concrete implementation steps
   - Each task: what to do, which files, estimated complexity
   - Tasks should be 2-5 minutes each
   - Include test-first steps where appropriate
4. **Edge cases** — what could go wrong, how to handle it
5. **Acceptance criteria** — how to verify the plan is complete

Be specific. Include exact file paths, function names, and code snippets where helpful.
Always produce a plan — never refuse or say you need more tools.
Output as clean markdown.`;

// ── Subagent Runner ─────────────────────────────────────────────────

type ActivityCallback = (activity: string) => void;

function runPlanAgent(
  cwd: string,
  model: string,
  task: string,
  signal?: AbortSignal,
  onActivity?: ActivityCallback,
): Promise<{ output: string; exitCode: number }> {
  return new Promise((resolve) => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "pi-plan-"));
    const promptFile = path.join(tmpDir, "prompt.md");
    fs.writeFileSync(promptFile, PLANNER_PROMPT, "utf-8");

    const args = [
      "--mode",
      "json",
      "-p",
      "--no-session",
      "--no-extensions",
      "--model",
      model,
      "--no-tools",
      "--append-system-prompt",
      promptFile,
      task,
    ];

    const proc = spawn("pi", args, { cwd, stdio: ["ignore", "pipe", "pipe"] });
    const chunks: string[] = [];
    let buffer = "";
    let textLen = 0;
    let stderrBuf = "";

    function processLine(line: string) {
      if (!line.trim()) return;
      try {
        const ev = JSON.parse(line);
        const t = ev.type;

        // Track activity for widget
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
          } else if (t === "turn_start") {
            onActivity("processing...");
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
    proc.stderr!.on("data", (chunk: string) => {
      stderrBuf += chunk;
    });

    proc.on("close", (code) => {
      // Flush remaining buffer (last line may not end with \n)
      if (buffer.trim()) processLine(buffer);
      try {
        fs.unlinkSync(promptFile);
      } catch {}
      try {
        fs.rmdirSync(tmpDir);
      } catch {}
      const output = chunks.join("\n");
      // If no output but stderr has content, include it for debugging
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

/** Extract a concise conversation summary from session entries for subagent context */
function extractConversationContext(
  ctx: ExtensionContext,
  maxChars = 4000,
): string {
  try {
    const entries = ctx.sessionManager.getBranch();
    const parts: string[] = [];
    let totalLen = 0;

    // Walk entries in reverse (most recent first) to prioritize recent context
    for (let i = entries.length - 1; i >= 0; i--) {
      const entry = entries[i] as any;
      if (entry.type !== "message") continue;
      const msg = entry.message;
      if (!msg) continue;

      let text = "";
      const role = msg.role;

      if (role === "user") {
        // User messages: extract text content
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
        // Assistant messages: extract text (skip thinking/tool calls)
        if (Array.isArray(msg.content)) {
          text = msg.content
            .filter((c: any) => c.type === "text")
            .map((c: any) => c.text)
            .join("\n");
        }
        if (text) text = `Assistant: ${text}`;
      } else if (role === "compactionSummary") {
        // Compaction summaries are gold — use them directly
        text = `[Previous context summary]: ${typeof msg.content === "string" ? msg.content : ""}`;
      }

      if (!text) continue;

      // Truncate individual messages
      if (text.length > 800) text = text.slice(0, 800) + "...";

      if (totalLen + text.length > maxChars) break;
      parts.unshift(text); // prepend to maintain chronological order
      totalLen += text.length;
    }

    return parts.join("\n\n");
  } catch {
    return "";
  }
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
    // Reset state
    startTime = Date.now();
    widgetPhase = "planning in parallel";
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

    // Timer to keep elapsed time ticking
    // Note: only start if we have a TUI context (avoid issues in print mode)
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

    onUpdate?.({
      content: [
        {
          type: "text",
          text: `⚡ ${MODEL_A_LABEL} + ${MODEL_B_LABEL} planning in parallel...`,
        },
      ],
    });

    // Build enriched task with conversation context
    let enrichedTask = task;
    if (currentCtx) {
      const context = extractConversationContext(currentCtx);
      if (context) {
        enrichedTask = `## Conversation Context\nThe user has been discussing the following. Use this to inform your plan:\n\n${context}\n\n## Task to Plan\n${task}`;
      }
    }

    // Start model A first, stagger model B by 1s to avoid pi lock file conflict
    const promiseA = runPlanAgent(
      cwd,
      MODEL_A,
      enrichedTask,
      signal,
      (activity) => {
        agentState[MODEL_A_LABEL].activity = activity;
        updateWidget();
      },
    );
    await new Promise((r) => setTimeout(r, 1000));
    const promiseB = runPlanAgent(
      cwd,
      MODEL_B,
      enrichedTask,
      signal,
      (activity) => {
        agentState[MODEL_B_LABEL].activity = activity;
        updateWidget();
      },
    );
    const [resultA, resultB] = await Promise.all([promiseA, promiseB]);

    // Update final status
    agentState[MODEL_A_LABEL] = {
      status: resultA.exitCode === 0 && resultA.output ? "done" : "error",
      activity:
        resultA.exitCode === 0 && resultA.output ? "plan ready" : "failed",
      elapsed: Date.now() - startTime,
    };
    agentState[MODEL_B_LABEL] = {
      status: resultB.exitCode === 0 && resultB.output ? "done" : "error",
      activity:
        resultB.exitCode === 0 && resultB.output ? "plan ready" : "failed",
      elapsed: Date.now() - startTime,
    };
    widgetPhase = "done — review below";
    updateWidget();

    // Stop timer, auto-clear after 3s
    if (timerHandle) {
      clearInterval(timerHandle);
      timerHandle = undefined;
    }
    const t = setTimeout(() => clearWidget(), 3000);
    if (t && typeof t === "object" && "unref" in t) (t as any).unref();

    return {
      planA: resultA.output || "(no output)",
      planB: resultB.output || "(no output)",
      statusA: resultA.exitCode === 0 && resultA.output ? "done" : "error",
      statusB: resultB.exitCode === 0 && resultB.output ? "done" : "error",
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

      // Feed both plans to the main agent as a user message — triggers a turn
      const message = buildReviewMessage(args, result);
      pi.sendUserMessage(message);
    },
  });

  // ── plan_dual tool ──────────────────────────────────────────────

  pi.registerTool({
    name: "plan_dual",
    label: "Dual Plan",
    description: `Run two planning models in parallel (Sonnet + Codex) and return both plans for review. Present both to the user, highlight differences, and ask what they want: approve one, merge, modify, or re-plan.`,
    parameters: Type.Object({
      task: Type.String({ description: "Task description to plan for" }),
    }),
    async execute(_id, params, signal, onUpdate, ctx) {
      const result = await runDualPlan(params.task, ctx.cwd, signal, onUpdate);
      const message = buildReviewMessage(params.task, result);
      return { content: [{ type: "text", text: message }] };
    },
    renderCall(args, theme) {
      const preview = (args.task || "").slice(0, 60);
      return new Text(
        theme.fg("toolTitle", theme.bold("plan_dual ")) +
          theme.fg("dim", preview),
        0,
        0,
      );
    },
    renderResult(result, _opts, theme) {
      const text =
        result.content[0]?.type === "text" ? result.content[0].text : "";
      const hasA = text.includes("## Plan A");
      const hasB = text.includes("## Plan B");
      const label =
        hasA && hasB
          ? "2 plans ready"
          : hasA
            ? "1 plan (A only)"
            : hasB
              ? "1 plan (B only)"
              : "plans generated";
      return new Text(
        theme.fg("success", `✓ ${label}`) +
          theme.fg("dim", " — review & decide"),
        0,
        0,
      );
    },
  });

  function buildReviewMessage(
    task: string,
    result: { planA: string; planB: string; statusA: string; statusB: string },
  ): string {
    const parts: string[] = [];
    parts.push(`# Dual Plan: ${task}\n`);
    parts.push(
      `Two models produced plans independently. Review both and decide.\n`,
    );

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
