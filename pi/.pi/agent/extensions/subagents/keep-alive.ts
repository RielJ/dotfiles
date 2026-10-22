/**
 * Keep-alive lifecycle for subagents.
 *
 * By default an autonomous subagent used to shut itself down the moment its
 * agent loop ended, and the parent killed its tmux window. Keep-alive lets the
 * orchestrator decide instead: the child parks after each completed turn and
 * signals the parent through a `${sessionFile}.turn` sidecar; the parent
 * delivers that turn's result, leaves the pane open for follow-up work via
 * subagent_message, and closes it only when the orchestrator calls
 * subagent_close or the idle timeout expires.
 *
 * Shared by the parent (index.ts) and the child (subagent-done.ts), so this
 * module must stay free of pi runtime imports.
 */
import { existsSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";

export interface KeepAliveConfig {
  /** Keep autonomous subagents open after each turn unless a spawn opts out. */
  enabled: boolean;
  /** Close a parked subagent after this many idle minutes. 0 disables it. */
  idleCloseMinutes: number;
}

export const DEFAULT_KEEP_ALIVE_CONFIG: KeepAliveConfig = {
  enabled: true,
  idleCloseMinutes: 30,
};

/**
 * Parse the optional `keepAlive` section of the subagents config.json.
 * Missing or invalid values fall back to the defaults rather than throwing, so
 * a typo never disables subagents entirely.
 */
export function parseKeepAliveConfig(rawConfig: unknown): KeepAliveConfig {
  const root =
    rawConfig && typeof rawConfig === "object"
      ? (rawConfig as Record<string, unknown>)
      : {};
  const section =
    root.keepAlive && typeof root.keepAlive === "object"
      ? (root.keepAlive as Record<string, unknown>)
      : {};

  const enabled =
    typeof section.enabled === "boolean"
      ? section.enabled
      : DEFAULT_KEEP_ALIVE_CONFIG.enabled;
  const minutes = section.idleCloseMinutes;
  const idleCloseMinutes =
    typeof minutes === "number" && Number.isFinite(minutes) && minutes >= 0
      ? minutes
      : DEFAULT_KEEP_ALIVE_CONFIG.idleCloseMinutes;

  return { enabled, idleCloseMinutes };
}

/** Read keep-alive settings from the first existing config file. */
export function loadKeepAliveConfig(paths: string[]): KeepAliveConfig {
  for (const path of paths) {
    if (!existsSync(path)) continue;
    try {
      return parseKeepAliveConfig(JSON.parse(readFileSync(path, "utf8")));
    } catch {
      return { ...DEFAULT_KEEP_ALIVE_CONFIG };
    }
  }
  return { ...DEFAULT_KEEP_ALIVE_CONFIG };
}

/**
 * Decide whether a spawn keeps its pane open after each turn.
 *
 * Only autonomous (auto-exit) pi agents are affected: interactive agents are
 * already user-driven, and the Claude Code CLI path has no turn signal. An
 * explicit `keepAlive` on the spawn wins over the config default.
 */
export function resolveKeepAlive(opts: {
  requested?: boolean;
  autoExit: boolean;
  cli?: string;
  config: KeepAliveConfig;
}): boolean {
  if (opts.cli === "claude") return false;
  if (!opts.autoExit) return false;
  return opts.requested ?? opts.config.enabled;
}

export interface TurnSignal {
  /** Monotonic per child process; lets the parent ignore stale signals. */
  seq: number;
  /** Epoch ms when the turn ended. */
  at: number;
  type: "done" | "error";
  errorMessage?: string;
}

export function turnSignalPath(sessionFile: string): string {
  return `${sessionFile}.turn`;
}

/** Write the turn signal atomically (tmp + rename) so the parent never reads half a file. */
export function writeTurnSignal(sessionFile: string, signal: TurnSignal): void {
  const target = turnSignalPath(sessionFile);
  const tmp = `${target}.${process.pid}.tmp`;
  writeFileSync(tmp, JSON.stringify(signal), "utf8");
  renameSync(tmp, target);
}

/**
 * Consume the turn signal, if any. The file is removed after reading so each
 * signal is delivered once. A malformed file is dropped and treated as absent.
 */
export function consumeTurnSignal(sessionFile: string): TurnSignal | null {
  const path = turnSignalPath(sessionFile);
  if (!existsSync(path)) return null;
  let parsed: unknown = null;
  try {
    parsed = JSON.parse(readFileSync(path, "utf8"));
  } catch {
    parsed = null;
  }
  rmSync(path, { force: true });

  const record =
    parsed && typeof parsed === "object"
      ? (parsed as Record<string, unknown>)
      : null;
  if (!record) return null;
  if (record.type !== "done" && record.type !== "error") return null;
  if (typeof record.seq !== "number" || typeof record.at !== "number") {
    return null;
  }
  return {
    seq: record.seq,
    at: record.at,
    type: record.type,
    ...(typeof record.errorMessage === "string"
      ? { errorMessage: record.errorMessage }
      : {}),
  };
}

export type AgentEndAction = "exit" | "report" | "wait";

/**
 * What a child does when its agent loop ends.
 *
 * - "wait": stay open silently. Used while an ask_question is pending, while
 *   its own children are still running, after the user aborted the turn, or
 *   for interactive agents.
 * - "report": keep-alive agents park and signal the parent with the result.
 * - "exit": legacy auto-exit agents shut down.
 */
export function resolveAgentEndAction(opts: {
  autoExit: boolean;
  keepAlive: boolean;
  awaitingAnswer: boolean;
  pendingChildren: boolean;
  turnCompleted: boolean;
}): AgentEndAction {
  if (opts.awaitingAnswer || opts.pendingChildren) return "wait";
  if (!opts.turnCompleted) return "wait";
  if (opts.keepAlive) return "report";
  if (opts.autoExit) return "exit";
  return "wait";
}

/** True when a parked subagent has been idle long enough to close it. */
export function shouldIdleClose(
  parkedSinceMs: number | undefined,
  nowMs: number,
  idleCloseMinutes: number,
): boolean {
  if (parkedSinceMs == null || idleCloseMinutes <= 0) return false;
  return nowMs - parkedSinceMs >= idleCloseMinutes * 60_000;
}
