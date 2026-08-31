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

export interface PollResult {
  reason: "done" | "sentinel" | "error";
  exitCode: number;
  errorMessage?: string;
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
    onTick?: (elapsed: number) => void;
  },
): Promise<PollResult> {
  const start = Date.now();
  for (;;) {
    signal.throwIfAborted();

    if (options.sessionFile) {
      const exitFile = `${options.sessionFile}.exit`;
      try {
        if (existsSync(exitFile)) {
          const result = interpretExitSidecar(
            JSON.parse(readFileSync(exitFile, "utf8")),
          );
          rmSync(exitFile, { force: true });
          return result;
        }
      } catch {
        // A partially-written sidecar will be retried on the next tick.
      }
    }

    if (options.sentinelFile && existsSync(options.sentinelFile)) {
      return { reason: "sentinel", exitCode: 0 };
    }

    const screen = await readScreenAsync(surface, 8);
    const match = screen.match(/__SUBAGENT_DONE_(\d+)__/);
    if (match)
      return { reason: "sentinel", exitCode: Number.parseInt(match[1], 10) };

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
