// Adapted from amosblomqvist/pi-interactive-subagents (MIT).
// This fork uses one hidden `_pi-agents` tmux session with one window per agent.
import { existsSync, readFileSync, rmSync } from "node:fs";
import {
  capturePane,
  createWindow,
  killWindow,
  openPopup,
  sendMessage,
  tmuxAvailable,
  windowAlive,
} from "./tmux-pool.ts";

export function isTmuxAvailable(): boolean {
  return tmuxAvailable();
}

export function isMuxAvailable(): boolean {
  return tmuxAvailable();
}

export function muxSetupHint(): string {
  return "Start Pi inside tmux (`tmux new -A -s pi 'pi'`).";
}

export function shellEscape(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`;
}

export function createSurface(name: string): string {
  return createWindow(name);
}

export function createSurfaceSplit(
  name: string,
  _direction: "left" | "right" | "up" | "down",
  _fromSurface?: string,
): string {
  return createWindow(name);
}

export function sendCommand(surface: string, command: string): void {
  if (!sendMessage(surface, command)) {
    throw new Error(`Failed to send command to subagent window "${surface}"`);
  }
}

export function sendLongCommand(
  surface: string,
  command: string,
  options?: { scriptPath?: string; scriptPreamble?: string },
): string {
  const { dirname, join } = require("node:path") as typeof import("node:path");
  const { tmpdir } = require("node:os") as typeof import("node:os");
  const { mkdirSync, writeFileSync } =
    require("node:fs") as typeof import("node:fs");
  const scriptPath =
    options?.scriptPath ??
    join(
      tmpdir(),
      "pi-subagent-scripts",
      `cmd-${Date.now()}-${Math.random().toString(16).slice(2, 8)}.sh`,
    );
  mkdirSync(dirname(scriptPath), { recursive: true });
  const lines = ["#!/bin/bash"];
  if (options?.scriptPreamble) lines.push(options.scriptPreamble.trimEnd());
  lines.push(command);
  writeFileSync(scriptPath, `${lines.join("\n")}\n`, { mode: 0o755 });
  sendCommand(surface, `bash ${shellEscape(scriptPath)}`);
  return scriptPath;
}

export function readScreen(surface: string, lines = 50): string {
  return capturePane(surface, lines);
}

export async function readScreenAsync(
  surface: string,
  lines = 50,
): Promise<string> {
  return capturePane(surface, lines);
}

export function closeSurface(surface: string): void {
  killWindow(surface);
}

export function attachSurface(surface: string): void {
  openPopup(surface);
}

export function surfaceAlive(surface: string): boolean {
  return windowAlive(surface);
}

/** Where the launch script records the child's exit status. */
export function exitStatusFile(base: string): string {
  return `${base}.rc`;
}

/** Where the launch script records its own PID (derived from the status file). */
export function launchPidFile(statusFile: string): string {
  return `${statusFile.replace(/\.rc$/, "")}.pid`;
}

/** Whether a process exists. EPERM means it exists but belongs to someone else. */
function processAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === "EPERM";
  }
}

/**
 * Wrap a subagent launch command so its exit status always reaches the
 * watcher. `trap ':' TERM` keeps the script alive when the whole job gets
 * SIGTERM (exit 143): bash waits for the child, runs the no-op trap, then
 * writes the status. A plain `cmd; echo $?` dies with the child and writes
 * nothing. The trap is a handler, not an ignore, so the child still receives
 * SIGTERM normally. SIGKILL can't be trapped; pollForExit's idle-shell check
 * covers that case.
 */
export function wrapSubagentCommand(command: string, statusFile: string): string {
  const file = shellEscape(statusFile);
  return [
    `rm -f ${file}`,
    // The watcher checks this PID to notice a launch script that died
    // without writing its status (SIGKILL).
    `echo $$ > ${shellEscape(launchPidFile(statusFile))}`,
    `trap ':' TERM`,
    `${command}`,
    `__pi_rc=$?`,
    `echo "$__pi_rc" > ${file}`,
    `echo '__SUBAGENT_DONE_'$__pi_rc'__'`,
  ].join("; ");
}

export interface PollResult {
  /** `crashed`: the child exited non-zero or vanished without reporting a result. */
  reason: "done" | "sentinel" | "error" | "crashed";
  exitCode: number;
  errorMessage?: string;
}

// Real error output first; the shell's own "Terminated"/"killed" job notices
// only when nothing better is on screen.
const ERROR_LINE =
  /\b(error|exception|fatal|panic|traceback|stale|ENOENT|EACCES|segmentation)\b/i;
const SIGNAL_LINE = /\b(killed|terminated)\b/i;

/** The last line on screen that looks like an error, for crash reports. */
export function lastErrorLine(screen: string): string | null {
  const lines = screen
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line && !line.includes("__SUBAGENT_DONE_"));
  for (const pattern of [ERROR_LINE, SIGNAL_LINE]) {
    for (let i = lines.length - 1; i >= 0; i--) {
      if (pattern.test(lines[i])) return lines[i].slice(0, 300);
    }
  }
  return null;
}

function crashResult(exitCode: number | null, screen: string): PollResult {
  const signal = exitCode !== null && exitCode > 128 ? ` (signal ${exitCode - 128})` : "";
  const status =
    exitCode === null
      ? "ended without reporting an exit status (killed, e.g. SIGKILL)"
      : `exited with code ${exitCode}${signal}`;
  const line = lastErrorLine(screen);
  return {
    reason: "crashed",
    exitCode: exitCode ?? 1,
    errorMessage: line ? `Sub-agent process ${status}: ${line}` : `Sub-agent process ${status}.`,
  };
}


function interpretExitSidecar(data: unknown): PollResult {
  const record =
    data && typeof data === "object" ? (data as Record<string, unknown>) : null;
  if (record?.type === "error") {
    const message =
      typeof record.errorMessage === "string" ? record.errorMessage.trim() : "";
    return {
      reason: "error",
      exitCode: 1,
      errorMessage: message || "Subagent exited with an agent error.",
    };
  }
  return { reason: "done", exitCode: 0 };
}

export const __pollForExitTest__ = { interpretExitSidecar };

export async function pollForExit(
  surface: string,
  signal: AbortSignal,
  options: {
    interval: number;
    sessionFile?: string;
    sentinelFile?: string;
    /** Exit-status file written by wrapSubagentCommand. */
    statusFile?: string;
    onTick?: (elapsed: number) => void;
  },
): Promise<PollResult> {
  const start = Date.now();
  const statusFile =
    options.statusFile ??
    (options.sessionFile ? exitStatusFile(options.sessionFile) : undefined);
  const pidFile = statusFile ? launchPidFile(statusFile) : undefined;
  // The launch script that is running now. A PID file left by an earlier run
  // only counts once the current script overwrites it, so read it fresh.
  const launchAlive = (): boolean | null => {
    if (!pidFile || !existsSync(pidFile)) return null;
    const pid = Number.parseInt(readFileSync(pidFile, "utf8").trim(), 10);
    return Number.isInteger(pid) && pid > 0 ? processAlive(pid) : null;
  };

  // Checks that rely on the child (or its wrapper) reporting how it ended.
  const reported = (screen: string): PollResult | null => {
    const result = reportedRaw(screen);
    if (result && pidFile) rmSync(pidFile, { force: true });
    return result;
  };
  const reportedRaw = (screen: string): PollResult | null => {
    if (options.sessionFile) {
      const exitFile = `${options.sessionFile}.exit`;
      try {
        if (existsSync(exitFile)) {
          const result = interpretExitSidecar(
            JSON.parse(readFileSync(exitFile, "utf8")),
          );
          rmSync(exitFile, { force: true });
          if (statusFile) rmSync(statusFile, { force: true });
          return result;
        }
      } catch {
        // A partially-written sidecar will be retried on the next tick.
      }
    }

    if (options.sentinelFile && existsSync(options.sentinelFile)) {
      return { reason: "sentinel", exitCode: 0 };
    }

    if (statusFile && existsSync(statusFile)) {
      const text = readFileSync(statusFile, "utf8").trim();
      // Empty means the wrapper is mid-write; retry next tick.
      if (/^\d+$/.test(text)) {
        rmSync(statusFile, { force: true });
        const code = Number.parseInt(text, 10);
        return code === 0 ? { reason: "sentinel", exitCode: 0 } : crashed(code, screen);
      }
    }

    const match = screen.match(/__SUBAGENT_DONE_(\d+)__/);
    if (match) {
      const code = Number.parseInt(match[1], 10);
      return code === 0 ? { reason: "sentinel", exitCode: 0 } : crashed(code, screen);
    }
    return null;
  };
  // Crash reports read more history to find the error line.
  const crashed = (code: number | null, _screen?: string): PollResult =>
    crashResult(code, capturePane(surface, 40));

  for (;;) {
    signal.throwIfAborted();

    let screen = await readScreenAsync(surface, 8);
    const result = reported(screen);
    if (result) return result;

    // SIGKILL ends the launch script before it can write its status, and
    // the window stays alive at a shell prompt. The script's PID tells.
    if (launchAlive() === false) {
      // Re-check once: the script may have reported between the two reads.
      screen = await readScreenAsync(surface, 8);
      const late = reported(screen);
      if (pidFile) rmSync(pidFile, { force: true });
      return late ?? crashed(null, screen);
    }

    if (!windowAlive(surface) && !screen) {
      return {
        reason: "error",
        exitCode: 1,
        errorMessage: "Subagent tmux window exited unexpectedly.",
      };
    }

    options.onTick?.(Math.floor((Date.now() - start) / 1000));
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(resolve, options.interval);
      const onAbort = () => {
        clearTimeout(timer);
        reject(signal.reason ?? new Error("Aborted"));
      };
      signal.addEventListener("abort", onAbort, { once: true });
      if (signal.aborted) onAbort();
    });
  }
}
