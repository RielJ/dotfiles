import { realpathSync, readFileSync, statSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { gate } from "./approval.ts";
import { DIALOG_PAUSE_MS, formatDuration, PauseSwitch, parseDuration } from "./pause.ts";
import { Evaluator } from "./policy.ts";
import { parseRules, type Rules } from "./rules.ts";

/** ~/.pi/agent/damage-control-rules.yaml, two levels above this file. */
const RULES_PATH = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "damage-control-rules.yaml");

const EMPTY: Rules = { bash: [], zeroAccess: [], readOnly: [], noDelete: [] };

function tempRoots(): string[] {
  const roots = new Set(["/tmp", "/private/tmp", "/var/folders"]);
  for (const dir of [tmpdir(), process.env.TMPDIR]) {
    if (!dir) continue;
    roots.add(dir.replace(/\/+$/, ""));
    try {
      roots.add(realpathSync(dir).replace(/\/+$/, ""));
    } catch {
      // TMPDIR points at a missing folder: the unresolved path above is still covered.
      continue;
    }
  }
  return [...roots];
}

function summarize(toolName: string, input: unknown): string {
  const record = typeof input === "object" && input !== null ? (input as Record<string, unknown>) : {};
  const text = typeof record.command === "string" ? record.command : JSON.stringify(record.path ?? record);
  const short = text.length > 600 ? `${text.slice(0, 600)}…` : text;
  return `${toolName}: ${short}`;
}

/**
 * Enforces damage-control-rules.yaml. Hard rules block at once; every other match shows a
 * Block/Allow once dialog (Block focused), and no answer within 2 minutes blocks the call with the reason.
 * /damage-control off [duration] pauses the dialog for this session only; hard rules still block.
 */
export default function damageControl(pi: ExtensionAPI) {
  let cached: { mtimeMs: number; rules: Rules } | undefined;
  let reportedError: string | undefined;
  const roots = tempRoots();
  const pause = new PauseSwitch();
  let expiryTimer: ReturnType<typeof setTimeout> | undefined;

  type UI = { notify(msg: string, level?: "info" | "warning" | "error"): void; setStatus(key: string, text: string | undefined): void };

  const startPause = (ms: number | null, ui: UI | undefined) => {
    pause.pause(ms);
    clearTimeout(expiryTimer);
    expiryTimer = undefined;
    ui?.setStatus("damage-control", pause.statusText());
    if (ms === null) return;
    expiryTimer = setTimeout(() => {
      expiryTimer = undefined;
      if (pause.isPaused()) return; // paused again with a new deadline; that pause owns the timer
      ui?.setStatus("damage-control", undefined);
      ui?.notify("Damage control is back on: risky commands ask for approval again.", "info");
    }, ms + 50);
    expiryTimer.unref?.();
  };

  const resume = (ui: UI) => {
    pause.resume();
    clearTimeout(expiryTimer);
    expiryTimer = undefined;
    ui.setStatus("damage-control", undefined);
  };

  pi.registerCommand("damage-control", {
    description:
      "Pause or resume damage-control approval prompts for this session: /damage-control off [30m|1h] · on · status. Hard rules always block.",
    getArgumentCompletions: (prefix) =>
      ["status", "on", "off", "off 15m", "off 1h"]
        .filter((v) => v.startsWith(prefix.trim()))
        .map((v) => ({ value: v, label: v })),
    handler: async (args, ctx) => {
      const [verb = "status", ...rest] = (args ?? "").trim().split(/\s+/).filter(Boolean);
      switch (verb.toLowerCase()) {
        case "status":
          ctx.ui.notify(pause.describe(), "info");
          return;
        case "on":
          resume(ctx.ui);
          ctx.ui.notify(pause.describe(), "info");
          return;
        case "off": {
          let ms: number | null = null;
          if (rest.length > 0) {
            const parsed = parseDuration(rest.join(""));
            if ("error" in parsed) {
              ctx.ui.notify(parsed.error, "error");
              return;
            }
            ms = parsed.ms;
          }
          startPause(ms, ctx.ui);
          ctx.ui.notify(pause.describe(), "warning");
          return;
        }
        default:
          ctx.ui.notify("Usage: /damage-control off [30s|10m|1h] · on · status", "error");
      }
    },
  });

  const loadRules = (notify: (msg: string) => void): Rules => {
    try {
      const { mtimeMs } = statSync(RULES_PATH);
      if (cached?.mtimeMs === mtimeMs) return cached.rules;
      const rules = parseRules(readFileSync(RULES_PATH, "utf8"));
      cached = { mtimeMs, rules };
      reportedError = undefined;
      return rules;
    } catch (error) {
      const msg = `damage-control: cannot load ${RULES_PATH}: ${(error as Error).message}. Using ${cached ? "the last good rules" : "built-in checks only"}.`;
      if (msg !== reportedError) notify(msg);
      reportedError = msg;
      return cached?.rules ?? EMPTY;
    }
  };

  pi.on("tool_call", async (event, ctx) => {
    const rules = loadRules((msg) => (ctx.hasUI ? ctx.ui.notify(msg, "error") : console.error(msg)));
    const evaluator = new Evaluator(rules, { cwd: ctx.cwd, home: homedir(), tempRoots: roots });
    const decision = evaluator.evaluate(event.toolName, event.input);
    const summary = summarize(event.toolName, event.input);
    const result = await gate(decision, {
      hasUI: ctx.hasUI,
      ui: ctx.ui,
      signal: ctx.signal,
      summary,
      isPaused: () => pause.isPaused(),
      onPause: () => {
        startPause(DIALOG_PAUSE_MS, ctx.ui);
        ctx.ui.notify(`Damage control prompts paused for ${formatDuration(DIALOG_PAUSE_MS)}. /damage-control on resumes them.`, "warning");
      },
    });
    // Leave a trail of what ran unasked, so a pause is never silent.
    if (!result && decision.action === "ask" && pause.isPaused() && ctx.hasUI) {
      ctx.ui.notify(`damage-control (paused) allowed ${summary.slice(0, 160)}`, "info");
    }
    return result;
  });
}
