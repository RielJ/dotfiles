import type { Decision } from "./policy.ts";

export const APPROVAL_TIMEOUT_MS = 120_000;

export type ConfirmUI = {
  select(title: string, options: string[], opts?: { signal?: AbortSignal; timeout?: number }): Promise<string | undefined>;
};

/** Block is listed first, so the focused default and a stray Enter never run the call. */
export const BLOCK_OPTION = "Block";
export const ALLOW_OPTION = "Allow once";

export type GateResult = { block: true; reason: string } | undefined;

type GateOptions = {
  hasUI: boolean;
  ui: ConfirmUI;
  signal?: AbortSignal;
  timeoutMs?: number;
  summary: string;
};

const NO_RETRY =
  "Do not retry this command or a workaround that has the same effect. Tell the user what you wanted to run and why, or pick a safer approach.";

function bullets(reasons: string[]): string {
  return reasons.map((r) => `- ${r}`).join("\n");
}

/** Serializes prompts so parallel tool calls show one dialog at a time. */
let queue: Promise<unknown> = Promise.resolve();

/**
 * allow → run. block → refuse at once. ask → select dialog with a countdown;
 * anything but "Allow once" (Block, Escape, timeout, abort, no UI in print mode) → refuse.
 */
export async function gate(decision: Decision, opts: GateOptions): Promise<GateResult> {
  if (decision.action === "allow") return undefined;
  if (decision.action === "block") {
    return { block: true, reason: `Blocked by damage-control (never allowed):\n${bullets(decision.reasons)}\n${NO_RETRY}` };
  }
  if (!opts.hasUI) {
    return {
      block: true,
      reason: `Blocked by damage-control: needs user approval, and this session has no UI to ask.\n${bullets(decision.reasons)}\n${NO_RETRY}`,
    };
  }

  const timeoutMs = opts.timeoutMs ?? APPROVAL_TIMEOUT_MS;
  const ask = async (): Promise<boolean> => {
    if (opts.signal?.aborted) return false;
    try {
      const choice = await opts.ui.select(
        `Damage control: allow this?\n${opts.summary}\n\n${bullets(decision.reasons)}\n\nNo answer in ${Math.round(timeoutMs / 1000)}s blocks it.`,
        [BLOCK_OPTION, ALLOW_OPTION],
        { signal: opts.signal, timeout: timeoutMs },
      );
      return choice === ALLOW_OPTION;
    } catch {
      return false;
    }
  };
  const turn = queue.then(ask, ask);
  queue = turn;
  const approved = await turn;
  if (approved) return undefined;
  return {
    block: true,
    reason: `Blocked by damage-control: the user declined or did not answer within ${Math.round(timeoutMs / 1000)} seconds.\n${bullets(decision.reasons)}\n${NO_RETRY}`,
  };
}
