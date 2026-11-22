/**
 * Opens a read-only viewer window in the shared `_pi-agents` tmux session for a
 * headless plan/review worker, so the worker can be watched like a subagent.
 *
 * Workers stay plain child processes (see runAgent); the window only tails the
 * worker's NDJSON stream with `_stream-viewer.ts`. Everything here is best
 * effort: without tmux, or if tmux fails, the run continues with no window.
 *
 * Shares two conventions with extensions/subagents/tmux-pool.ts:
 *   - the pool session name `_pi-agents`
 *   - the `_idle` placeholder window that the pool session is created with,
 *     which is removed as soon as a real window exists.
 */
import { execFileSync } from "node:child_process";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

export const POOL_SESSION = "_pi-agents";
export const IDLE_WINDOW = "_idle";

const VIEWER_SCRIPT = fileURLToPath(
  new URL("./_stream-viewer.ts", import.meta.url),
);

/** Runs one tmux command. Throws on failure. */
export type TmuxRunner = (args: string[]) => void;

const defaultRunner: TmuxRunner = (args) => {
  execFileSync("tmux", args, { stdio: "ignore" });
};

export interface ViewerTarget {
  /** tmux window name (already sanitized). */
  window: string;
  /** Header shown at the top of the window. */
  label: string;
}

export interface OpenViewerOptions extends ViewerTarget {
  logPath: string;
  pid: number;
  cwd: string;
}

function slug(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

/**
 * Viewer target for one member of a multi-model run.
 * Run ids look like `20261122-043707-plan`; the window becomes `plan-043707-a`.
 */
export function memberViewer(
  runId: string,
  member: string,
  label: string,
): ViewerTarget {
  const [, time, kind] = runId.split("-");
  const prefix = time && kind ? `${kind}-${time}` : runId;
  return {
    window: slug(`${prefix}-${member}`) || "worker",
    label: `${label} (${runId})`,
  };
}

/** `node` binary to run the viewer with: pi's own when pi runs on node. */
function nodeBinary(): string {
  return path.basename(process.execPath).startsWith("node")
    ? process.execPath
    : "node";
}

function ensurePool(run: TmuxRunner): void {
  try {
    run(["has-session", "-t", `=${POOL_SESSION}`]);
  } catch {
    run([
      "new-session",
      "-d",
      "-s",
      POOL_SESSION,
      "-n",
      IDLE_WINDOW,
      "-x",
      "220",
      "-y",
      "50",
    ]);
    try {
      run(["set-option", "-t", POOL_SESSION, "destroy-unattached", "off"]);
    } catch {
      // Older tmux versions lack the option; the detached session still works.
    }
  }
}

function tryRun(run: TmuxRunner, args: string[]): void {
  try {
    run(args);
  } catch {
    // Missing windows are fine.
  }
}

/**
 * Open (or replace) the viewer window for a worker. Returns false, without
 * throwing, when pi is not inside tmux or tmux fails.
 */
export function openViewer(
  opts: OpenViewerOptions,
  run: TmuxRunner = defaultRunner,
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  if (!env.TMUX) return false;
  try {
    ensurePool(run);
    tryRun(run, ["kill-window", "-t", `=${POOL_SESSION}:=${opts.window}`]);
    // Several command arguments make tmux exec them directly, without a shell.
    run([
      "new-window",
      "-d",
      "-t",
      `=${POOL_SESSION}:`,
      "-n",
      opts.window,
      "-c",
      opts.cwd,
      nodeBinary(),
      VIEWER_SCRIPT,
      opts.logPath,
      String(opts.pid),
      opts.label,
    ]);
    tryRun(run, ["kill-window", "-t", `=${POOL_SESSION}:=${IDLE_WINDOW}`]);
    return true;
  } catch {
    return false;
  }
}
