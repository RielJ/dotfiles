import { homedir } from "node:os";
import { join } from "node:path";

import type { AgentMessage } from "@earendil-works/pi-agent-core";
import type {
  SessionBeforeCompactEvent,
  SessionEntry,
  SessionManager,
} from "@earendil-works/pi-coding-agent";
import { createJiti } from "jiti";

import {
  standingRules,
  withStandingRules,
} from "../../extensions/standing-rules/inject.ts";
import { rulesSection } from "../../extensions/standing-rules/rules.ts";
import type { CompactionPreparation } from "./pi-internals.ts";

export interface CompactInput {
  preparation: CompactionPreparation;
  branchEntries: SessionEntry[];
  sessionManager: SessionManager;
}

export interface CompactOutput {
  summary: string;
  firstKeptEntryId: string;
  tokensBefore: number;
  details?: unknown;
}

/**
 * A method under test. `compact` replaces Pi's compaction (undefined means the
 * method never compacts). `transformContext` rewrites the messages the model
 * sees, as a `context` event handler would.
 */
export interface Variant {
  name: string;
  compact?: (input: CompactInput) => Promise<CompactOutput>;
  transformContext?: (
    messages: AgentMessage[],
    branch: SessionEntry[],
  ) => AgentMessage[];
}

type Handler = (event: unknown, ctx: unknown) => unknown;

function isCompactOutput(
  value: unknown,
): value is { compaction: CompactOutput } {
  if (typeof value !== "object" || value === null || !("compaction" in value))
    return false;
  const c = value.compaction;
  return (
    typeof c === "object" &&
    c !== null &&
    "summary" in c &&
    typeof c.summary === "string" &&
    "firstKeptEntryId" in c &&
    typeof c.firstKeptEntryId === "string"
  );
}

export function piVccHookPath(): string {
  const agentDir =
    process.env.PI_CODING_AGENT_DIR ?? join(homedir(), ".pi", "agent");
  return join(
    agentDir,
    "npm",
    "node_modules",
    "@sting8k",
    "pi-vcc",
    "src",
    "hooks",
    "before-compact.ts",
  );
}

/**
 * The installed pi-vcc compaction hook, run through a stub ExtensionAPI that
 * only records handlers. It reads your real pi-vcc-config.json.
 */
export async function piVccVariant(
  hookPath = piVccHookPath(),
): Promise<Variant> {
  const jiti = createJiti(import.meta.url, { moduleCache: false });
  const mod: unknown = await jiti.import(hookPath);
  if (
    typeof mod !== "object" ||
    mod === null ||
    !("registerBeforeCompactHook" in mod) ||
    typeof mod.registerBeforeCompactHook !== "function"
  )
    throw new Error(`registerBeforeCompactHook not found in ${hookPath}`);
  const register = mod.registerBeforeCompactHook;

  return {
    name: "pi-vcc",
    async compact({ preparation, branchEntries, sessionManager }) {
      const handlers = new Map<string, Handler>();
      register({
        on: (event: string, handler: Handler) => handlers.set(event, handler),
      });
      const handler = handlers.get("session_before_compact");
      if (!handler)
        throw new Error("pi-vcc registered no session_before_compact handler");
      const event: SessionBeforeCompactEvent = {
        type: "session_before_compact",
        preparation,
        branchEntries,
        reason: "threshold",
        willRetry: false,
        signal: new AbortController().signal,
      };
      const ctx = {
        sessionManager,
        model: { provider: "anthropic" },
        hasUI: false,
        ui: { notify() {} },
        cwd: sessionManager.getCwd(),
      };
      const result = await handler(event, ctx);
      if (!isCompactOutput(result))
        throw new Error(
          "pi-vcc declined to compact (Pi would fall back to its own summary)",
        );
      return result.compaction;
    },
  };
}

/**
 * pi-vcc's summary, plus the standing-rules extension's `context` handler,
 * using the extension's own code: rules from the summarized messages are
 * injected after the summary, the way the live extension does it.
 */
export async function piVccInjectVariant(
  budgetChars: number,
): Promise<Variant> {
  const base = await piVccVariant();
  return {
    name: `pi-vcc+inject:${budgetChars}`,
    compact: base.compact,
    transformContext(messages, branch) {
      const rules = standingRules(branch, budgetChars);
      return rules ? withStandingRules(messages, rules) : messages;
    },
  };
}

/** Control: never compacts, so every commitment must stay intact. */
export const noneVariant: Variant = { name: "none" };

/**
 * Eval-only: pi-vcc's summary plus the user's standing rules, verbatim, capped
 * at `budgetChars`. Tests whether carrying rules forward fixes retention and
 * what it costs. Pi and pi-vcc are not changed.
 */
export async function piVccRulesVariant(budgetChars: number): Promise<Variant> {
  const base = await piVccVariant();
  const compact = base.compact;
  if (!compact) throw new Error("pi-vcc variant has no compact");
  return {
    name: `pi-vcc+rules:${budgetChars}`,
    async compact(input) {
      const out = await compact(input);
      const section = rulesSection(input.branchEntries, budgetChars);
      return { ...out, summary: out.summary + section.text };
    },
  };
}

export async function loadVariant(name: string): Promise<Variant> {
  const rules = /^pi-vcc\+rules(?::(\d+))?$/.exec(name);
  if (rules) return piVccRulesVariant(Number(rules[1] ?? 4000));
  const inject = /^pi-vcc\+inject(?::(\d+))?$/.exec(name);
  if (inject) return piVccInjectVariant(Number(inject[1] ?? 4000));
  switch (name) {
    case "none":
      return noneVariant;
    case "pi-vcc":
      return piVccVariant();
    default:
      throw new Error(
        `unknown variant "${name}" (known: none, pi-vcc, pi-vcc+rules[:budgetChars], pi-vcc+inject[:budgetChars])`,
      );
  }
}
