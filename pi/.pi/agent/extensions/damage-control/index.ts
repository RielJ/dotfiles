import { realpathSync, readFileSync, statSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { gate } from "./approval.ts";
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
 */
export default function damageControl(pi: ExtensionAPI) {
  let cached: { mtimeMs: number; rules: Rules } | undefined;
  let reportedError: string | undefined;
  const roots = tempRoots();

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
    return gate(decision, {
      hasUI: ctx.hasUI,
      ui: ctx.ui,
      signal: ctx.signal,
      summary: summarize(event.toolName, event.input),
    });
  });
}
