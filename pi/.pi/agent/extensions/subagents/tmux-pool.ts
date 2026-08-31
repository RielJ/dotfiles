// biome-ignore-all lint/suspicious/noEmptyBlockStatements: tmux cleanup operations are best-effort.
/**
 * tmux-pool — dedicated `_pi-agents` transport for subagents.
 *
 * Every subagent runs as a Pi process inside its own named window of ONE
 * shared, hidden `_pi-agents` tmux session. The parent (user) session is never
 * split or otherwise mutated. Users inspect a subagent through a
 * `tmux display-popup` overlay; dismissing the popup leaves the child running.
 *
 * Layout:
 *
 *   _pi-agents (hidden session, never attached by the user directly)
 *   ├── window "oauth-refresh"  ← Pi subagent running
 *   ├── window "login-review"   ← Pi subagent running
 *   └── ...
 *
 * This mirrors the model used by extensions/git-worktrees/src/tmux-swap.ts but
 * uses subagent-specific names (`_pi-agents`, `PI_SUBAGENT_READY_FILE`) so the
 * two pools never collide.
 *
 * Requires tmux 3.2+ for `display-popup`.
 */

import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";

/** The single shared, hidden session that hosts every subagent window. */
export const POOL_SESSION = "_pi-agents";
const READY_DIR = join(tmpdir(), "pi-agents-ready");

// ── tmux detection ──────────────────────────────────────────────────

export function inTmux(): boolean {
  return Boolean(process.env.TMUX && process.env.TMUX_PANE);
}

export function tmuxAvailable(): boolean {
  if (!inTmux()) return false;
  try {
    execFileSync("tmux", ["-V"], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

// ── Name sanitization ───────────────────────────────────────────────

/**
 * Turn an arbitrary agent name into a safe tmux window name. tmux treats `.`
 * and `:` specially in target specs, so they are stripped. Result is always a
 * non-empty, lowercase, dash-delimited slug.
 */
export function sanitizeWindowName(name: string): string {
  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9\s_-]/g, "")
    .replace(/[\s_]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
  return slug || "subagent";
}

/** Build a fully-qualified `session:window` tmux target for an agent. */
export function windowTarget(name: string): string {
  return `${POOL_SESSION}:${sanitizeWindowName(name)}`;
}

// ── Ready-file signaling (called from the child's session_start) ─────

export function signalReady(): void {
  const readyFile = process.env.PI_SUBAGENT_READY_FILE;
  if (!readyFile) return;
  try {
    writeFileSync(readyFile, "");
  } catch {}
}

// ── Pool session management ─────────────────────────────────────────

/**
 * Ensure the `_pi-agents` session exists WITHOUT changing whatever the user is
 * currently attached to. `new-session -d` creates it detached; if it already
 * exists this is a no-op.
 */
export function ensurePoolSession(): void {
  try {
    execFileSync("tmux", ["has-session", "-t", POOL_SESSION], {
      stdio: "ignore",
    });
  } catch {
    execFileSync("tmux", [
      "new-session",
      "-d",
      "-s",
      POOL_SESSION,
      "-x",
      "220",
      "-y",
      "50",
    ]);
    // Never let the pool self-destruct when its windows close so the session
    // survives popup dismissal and reconciliation.
    try {
      execFileSync(
        "tmux",
        ["set-option", "-t", POOL_SESSION, "destroy-unattached", "off"],
        { stdio: "ignore" },
      );
    } catch {
      // tmux versions differ on this option; detached session still works.
      void 0;
    }
  }
}

// ── Spawn a subagent window ─────────────────────────────────────────

/** Create an empty detached shell window and return its sanitized name. */
export function createWindow(name: string, cwd = process.cwd()): string {
  if (!tmuxAvailable()) {
    throw new Error("tmux is required for subagents. Start Pi inside tmux.");
  }
  const window = sanitizeWindowName(name);
  killWindow(window);
  ensurePoolSession();
  execFileSync("tmux", [
    "new-window",
    "-d",
    "-t",
    `${POOL_SESSION}:`,
    "-n",
    window,
    "-c",
    cwd,
  ]);
  return window;
}

export interface SpawnWindowOptions {
  /** Stable agent name (also used as the window name after sanitization). */
  name: string;
  /** Shell command line to run inside the window. */
  command: string;
  /** Working directory for the child process. */
  cwd: string;
  /** Extra environment variables to inject into the window. */
  env?: Record<string, string>;
  /** How long to wait for the child's readiness signal, in ms. */
  readyTimeoutMs?: number;
}

/**
 * Create (or replace) a detached window in `_pi-agents` and start the Pi
 * command inside it. Returns true if the window was created and the child
 * signalled readiness before the timeout.
 */
export function spawnWindow(opts: SpawnWindowOptions): boolean {
  const target = windowTarget(opts.name);
  // Replace any stale window of the same name so re-spawns are deterministic.
  killWindow(opts.name);

  ensurePoolSession();

  mkdirSync(READY_DIR, { recursive: true });
  const readyFile = join(READY_DIR, randomUUID());

  const envArgs: string[] = ["-e", `PI_SUBAGENT_READY_FILE=${readyFile}`];
  for (const [key, value] of Object.entries(opts.env ?? {})) {
    envArgs.push("-e", `${key}=${value}`);
  }

  try {
    execFileSync("tmux", [
      "new-window",
      "-d",
      "-t",
      `${POOL_SESSION}:`,
      "-n",
      sanitizeWindowName(opts.name),
      "-c",
      opts.cwd,
      ...envArgs,
    ]);

    // Leading space keeps the command out of shell history where possible.
    execFileSync("tmux", [
      "send-keys",
      "-t",
      target,
      ` ${opts.command}`,
      "Enter",
    ]);

    waitForReady(readyFile, opts.readyTimeoutMs ?? 15000);
    return true;
  } catch {
    return false;
  } finally {
    try {
      rmSync(readyFile, { force: true });
    } catch {
      // Temporary readiness files are best-effort cleanup.
      void 0;
    }
  }
}

// ── Steer / send message to a running window ────────────────────────

/**
 * Send a steer message to a running subagent window. The text is delivered via
 * tmux `send-keys` using literal mode (`-l`) so shell metacharacters cannot be
 * interpreted, followed by an explicit Enter.
 */
export function sendMessage(name: string, text: string): boolean {
  const target = windowTarget(name);
  if (!windowAlive(name)) return false;
  try {
    // `-l` sends the string literally (no key-name interpretation), so a
    // message containing e.g. "Enter" or ";" is delivered verbatim.
    execFileSync("tmux", ["send-keys", "-t", target, "-l", text]);
    execFileSync("tmux", ["send-keys", "-t", target, "Enter"]);
    return true;
  } catch {
    return false;
  }
}

// ── Inspection ──────────────────────────────────────────────────────

/** Capture the last `lines` rows of a window's screen buffer. */
export function capturePane(name: string, lines = 40): string {
  const target = windowTarget(name);
  // Without this guard tmux resolves a missing window to the session's current
  // one and we would read another agent's screen.
  if (!windowAlive(name)) return "";
  try {
    const out = execFileSync(
      "tmux",
      ["capture-pane", "-p", "-t", target, "-S", `-${lines}`],
      { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] },
    );
    return out;
  } catch {
    return "";
  }
}

/**
 * Whether a window with this agent name currently exists in the pool.
 *
 * This must be an exact name match against the pool's window list. `tmux
 * display-message -t <missing-window>` exits 0 and silently falls back to the
 * session's current window, which would report every dead subagent as alive and
 * let steer messages land in the wrong window.
 */
export function windowAlive(name: string): boolean {
  return listWindows().includes(sanitizeWindowName(name));
}

/** List all window names in the pool. */
export function listWindows(): string[] {
  try {
    const out = execFileSync(
      "tmux",
      ["list-windows", "-t", POOL_SESSION, "-F", "#{window_name}"],
      { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] },
    );
    return out.split("\n").filter(Boolean);
  } catch {
    return [];
  }
}

// ── Lifecycle ───────────────────────────────────────────────────────

/** Stop (kill) a single subagent window. The pool itself is left intact. */
export function killWindow(name: string): void {
  const target = windowTarget(name);
  try {
    execFileSync("tmux", ["kill-window", "-t", target], { stdio: "ignore" });
  } catch {
    // Missing windows are already stopped.
    void 0;
  }
}

/**
 * Open a floating popup attached to the selected window. Dismissing the popup
 * (detach) leaves the child running. Defaults to a 95% overlay.
 */
export function openPopup(name: string, width = "95%", height = "95%"): void {
  if (!windowAlive(name)) {
    throw new Error(`Subagent "${name}" is not running`);
  }
  const target = windowTarget(name);
  try {
    execFileSync("tmux", ["select-window", "-t", target], { stdio: "ignore" });
  } catch {
    // Selection is best-effort; attach can still choose the window.
    void 0;
  }
  try {
    execFileSync(
      "tmux",
      [
        "display-popup",
        "-w",
        width,
        "-h",
        height,
        "-E",
        `tmux attach -t ${POOL_SESSION}`,
      ],
      { stdio: "ignore" },
    );
  } catch {
    // popup dismissed — normal
  }
}

// ── Helpers ─────────────────────────────────────────────────────────

function waitForReady(path: string, timeoutMs: number): void {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (existsSync(path)) return;
    sleepMs(20);
  }
}

function sleepMs(ms: number): void {
  const sab = new SharedArrayBuffer(4);
  const view = new Int32Array(sab);
  Atomics.wait(view, 0, 0, ms);
}
