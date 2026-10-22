/**
 * Pure helpers for background /plan and /review runs.
 *
 * Kept free of runtime imports (type imports only) so `node --test` can load
 * this file directly without Pi's module resolution.
 */
import type { MultiRun, RunKind } from "./multirun.js";

/** Nesting depth set by the subagents extension; 0 in a top-level session. */
export function subagentDepth(env: NodeJS.ProcessEnv = process.env): number {
  const parsed = Number.parseInt(env.PI_SUBAGENT_DEPTH ?? "0", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}

/**
 * Background mode is the default at top level. Inside a subagent, runs always
 * block so the subagent receives one tool result instead of a later message.
 */
export function shouldRunAsync(requested: boolean | undefined, env: NodeJS.ProcessEnv = process.env): boolean {
  if (subagentDepth(env) > 0) return false;
  return requested ?? true;
}

/** Strip a `--wait` flag from command arguments. */
export function parseWaitFlag(args: string): { wait: boolean; rest: string } {
  const tokens = args.trim().split(/\s+/).filter(Boolean);
  const wait = tokens.includes("--wait");
  return { wait, rest: tokens.filter((t) => t !== "--wait").join(" ") };
}

/**
 * Default run for follow-ups: the most recently delivered run, preferring
 * runs started in `cwd`. Runs that were never delivered (still running, or
 * saved before delivery tracking existed) count only when nothing in the pool
 * was delivered; then the newest by id wins. `runs` must be newest-first.
 */
export function pickLatestRun(runs: MultiRun[], kind: RunKind, cwd?: string): MultiRun | undefined {
  const ofKind = runs.filter((r) => r.kind === kind);
  const pick = (pool: MultiRun[]): MultiRun | undefined => {
    let best: MultiRun | undefined;
    for (const r of pool) {
      if (r.deliveredAt && (!best?.deliveredAt || r.deliveredAt > best.deliveredAt)) best = r;
    }
    return best ?? pool[0];
  };
  const local = cwd ? ofKind.filter((r) => r.cwd === cwd) : ofKind;
  return pick(local) ?? pick(ofKind);
}

/**
 * Resolve a stop argument against active run ids (newest last).
 * - empty → the newest run
 * - "all" → every run
 * - otherwise an exact id, or a substring that matches exactly one id
 */
export function matchRunIds(active: string[], arg: string): { ids: string[]; error?: string } {
  const query = arg.trim();
  if (active.length === 0) return { ids: [], error: "No background runs are active." };
  if (!query) return { ids: [active[active.length - 1]] };
  if (query === "all") return { ids: [...active] };
  if (active.includes(query)) return { ids: [query] };
  const hits = active.filter((id) => id.includes(query));
  if (hits.length === 1) return { ids: hits };
  if (hits.length === 0) return { ids: [], error: `No active run matches "${query}". Active: ${active.join(", ")}` };
  return { ids: [], error: `"${query}" matches several runs: ${hits.join(", ")}. Use the full id.` };
}
