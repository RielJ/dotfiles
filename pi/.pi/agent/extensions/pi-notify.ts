/**
 * Pi Notify Extension
 *
 * Sends a native notification + sound when Pi finishes and is waiting for input,
 * but ONLY when the terminal is not focused (you're in another app).
 *
 * "Waiting for input" means `agent_settled`, not `agent_end`. An agent run can
 * end and Pi carry straight on -- auto-retry, auto-compact and retry, or a
 * queued follow-up message -- so `agent_end` fires repeatedly during one long
 * task and pings you for work you are not being asked to do. `agent_settled`
 * fires once Pi will not continue on its own, which is the only moment the
 * notification is actually true.
 *
 * macOS: osascript notification + afplay sound
 * Windows: PowerShell toast notification
 * Linux: falls back to OSC terminal escape sequences
 *
 * It fires on exactly two things, both of which mean "you are being asked for
 * something":
 *
 *   1. `agent_settled` — Pi has stopped and will not continue on its own.
 *   2. a question tool starting — the agent is blocked on your answer, which
 *      can happen long before the run settles.
 *
 * Environment variables:
 *   PI_NOTIFY_SOUND      — path to sound file (default: /System/Library/Sounds/Glass.aiff)
 *   PI_NOTIFY_SOUND_CMD  — custom command to play sound (overrides PI_NOTIFY_SOUND)
 *   PI_NOTIFY_ASK_TOOLS  — comma-separated extra tool names treated as questions
 *   PI_NOTIFY_DISABLE    — set to any value to silence this extension entirely
 *   PI_NOTIFY_FORCE      — notify even from a session another agent is driving
 */

import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { execSync, spawn } from "node:child_process";

// ── Focus Detection ─────────────────────────────────────────────────

/**
 * Detect if the user is currently looking at this pi instance.
 *
 * Three layers of detection:
 *   1. Is the terminal app focused? (macOS frontmost app check)
 *   2. If in tmux: is the tmux window/pane where pi runs the active one?
 *
 * Returns true only if the user is actively looking at this pi session.
 */
function isUserLookingAtPi(): boolean {
    if (process.platform !== "darwin") return false;

    // Layer 1: Is the terminal app the frontmost window?
    let terminalFocused = false;
    try {
        const frontApp = execSync(
            'osascript -e \'tell application "System Events" to get name of first application process whose frontmost is true\'',
            { encoding: "utf-8", timeout: 3_000, stdio: ["ignore", "pipe", "ignore"] },
        ).trim().toLowerCase();
        const terminals = ["kitty", "iterm2", "terminal", "alacritty", "wezterm", "ghostty", "hyper", "warp"];
        terminalFocused = terminals.some(t => frontApp.includes(t));
    } catch {
        return false; // detection failed → assume not focused → notify
    }

    if (!terminalFocused) return false;

    // Layer 2: If in tmux, is this pane the one the user is looking at?
    if (process.env.TMUX && process.env.TMUX_PANE) {
        try {
            const paneActive = execSync(
                `tmux display-message -p -t "${process.env.TMUX_PANE}" "#{window_active} #{pane_active}"`,
                { encoding: "utf-8", timeout: 3_000, stdio: ["ignore", "pipe", "ignore"] },
            ).trim();
            // Both window AND pane must be active for the user to be looking at it
            return paneActive === "1 1";
        } catch {
            return false; // tmux query failed → assume not visible → notify
        }
    }

    // No tmux — terminal is focused and pi is in it
    return true;
}

// ── Notification Methods ────────────────────────────────────────────

function notifyMacOS(title: string, body: string): void {
    const child = spawn("osascript", [
        "-e",
        `display notification "${body.replace(/"/g, '\\"')}" with title "${title.replace(/"/g, '\\"')}"`,
    ], { detached: true, stdio: "ignore" });
    child.unref();
}

function notifyWindows(title: string, body: string): void {
    const type = "Windows.UI.Notifications";
    const script = [
        `[${type}.ToastNotificationManager, ${type}, ContentType = WindowsRuntime] > $null`,
        `$xml = [${type}.ToastNotificationManager]::GetTemplateContent([${type}.ToastTemplateType]::ToastText01)`,
        `$xml.GetElementsByTagName('text')[0].AppendChild($xml.CreateTextNode('${body}')) > $null`,
        `[${type}.ToastNotificationManager]::CreateToastNotifier('${title}').Show([${type}.ToastNotification]::new($xml))`,
    ].join("; ");
    const child = spawn("powershell.exe", ["-NoProfile", "-Command", script], {
        detached: true, stdio: "ignore",
    });
    child.unref();
}

function notifyOSC(title: string, body: string): void {
    const tmux = Boolean(process.env.TMUX);
    const wrap = (seq: string) => {
        if (!tmux) return seq;
        return `\x1bPtmux;${seq.split("\x1b").join("\x1b\x1b")}\x1b\\`;
    };

    if (process.env.KITTY_WINDOW_ID) {
        process.stdout.write(wrap(`\x1b]99;i=1:d=0;${title}\x1b\\`));
        process.stdout.write(wrap(`\x1b]99;i=1:p=body;${body}\x1b\\`));
    } else if (process.env.TERM_PROGRAM === "iTerm.app" || process.env.ITERM_SESSION_ID) {
        process.stdout.write(wrap(`\x1b]9;${title}: ${body}\x07`));
    } else {
        process.stdout.write(wrap(`\x1b]777;notify;${title};${body}\x07`));
    }
}

// ── Sound ───────────────────────────────────────────────────────────

function playSound(): void {
    // 1. Custom sound command
    const customCmd = process.env.PI_NOTIFY_SOUND_CMD?.trim();
    if (customCmd) {
        try {
            const child = spawn(customCmd, { shell: true, detached: true, stdio: "ignore" });
            child.unref();
        } catch {}
        return;
    }

    // 2. macOS system sound
    if (process.platform === "darwin") {
        try {
            const sound = process.env.PI_NOTIFY_SOUND || "/System/Library/Sounds/Glass.aiff";
            const child = spawn("afplay", [sound], { detached: true, stdio: "ignore" });
            child.unref();
        } catch {}
    }
}

// ── Main ────────────────────────────────────────────────────────────

/** Get tmux session/window info for the notification body */
function getTmuxContext(): string {
    if (!process.env.TMUX || !process.env.TMUX_PANE) return "";
    try {
        const info = execSync(
            `tmux display-message -p -t "${process.env.TMUX_PANE}" "#{session_name}:#{window_index} (#{window_name})"`,
            { encoding: "utf-8", timeout: 3_000, stdio: ["ignore", "pipe", "ignore"] },
        ).trim();
        return info ? ` [${info}]` : "";
    } catch {
        return "";
    }
}

function notify(title: string, body: string): void {
    // macOS: native notification, only when NOT looking at this pi instance
    if (process.platform === "darwin") {
        if (isUserLookingAtPi()) return;

        const tmuxCtx = getTmuxContext();
        notifyMacOS(title, `${body}${tmuxCtx}`);
        playSound();
        return;
    }

    // Windows
    if (process.env.WT_SESSION) {
        notifyWindows(title, body);
        playSound();
        return;
    }

    // Linux / other: OSC escape sequences
    notifyOSC(title, body);
    playSound();
}

// ── Policy ──────────────────────────────────────────────────

/**
 * Is there a human sitting in front of this process at all?
 *
 * `ctx.mode` is the only honest answer. `ctx.hasUI` is not: it is true in RPC
 * mode too, and RPC is precisely how headless subagents and worktree sessions
 * are spawned — so a `hasUI` guard would still ping the operator once per
 * background agent.
 *
 * Being wrong here is worse than a missed notification. `notifyOSC` writes
 * escape sequences to stdout, and in `--mode rpc` or `--mode json` stdout is
 * the protocol stream: a notification from a headless process can corrupt the
 * very run it is reporting on.
 */
function isAttended(ctx: Pick<ExtensionContext, "mode">): boolean {
    if (process.env.PI_NOTIFY_DISABLE) return false;
    if (isDrivenByAnotherAgent()) return false;
    return ctx.mode === "tui";
}

/**
 * Is this session being driven by something other than a human?
 *
 * `ctx.mode` catches the headless spawners (`--mode rpc`, `-p`) but not all of
 * them: a worktree agent gets a real TUI in a detached tmux window, so it is
 * "tui" by every test pi can offer while nobody is sitting in front of it.
 * Running several of those in parallel is what turns one notification per
 * settle into a stream of them.
 *
 * Detected by the markers the spawners already set, so nothing new has to be
 * threaded through. `PI_NOTIFY_FORCE` opts a specific session back in.
 */
function isDrivenByAnotherAgent(): boolean {
    if (process.env.PI_NOTIFY_FORCE) return false;
    const markers = [
        "PI_GIT_WORKTREES_BACKGROUND", // worktree background session
        "PI_WT_READY_FILE",            // worktree tmux window
        "PI_REAL_AGENT_DIR",           // adw shadow agent dir
    ];
    return markers.some((m) => process.env[m] !== undefined && process.env[m] !== "");
}

/** Tools whose execution means the agent is blocked on a human answer. */
function questionTools(): Set<string> {
    const extra = (process.env.PI_NOTIFY_ASK_TOOLS ?? "")
        .split(",")
        .map((s) => s.trim())
        .filter((s) => s !== "");
    return new Set(["ask_user_question", ...extra]);
}

export default function (pi: ExtensionAPI) {
    const asks = questionTools();

    /**
     * A question is a harder interrupt than a finished turn: the run is
     * stopped until it is answered, and it can be raised in the middle of a
     * long task the operator has deliberately walked away from.
     */
    pi.on("tool_execution_start", async (event, ctx) => {
        if (!isAttended(ctx)) return;
        if (!asks.has(event.toolName)) return;
        notify("Pi", "Waiting on your answer");
    });

    /**
     * `agent_settled`, not `agent_end`: a run can end and Pi carry straight on
     * with an auto-retry, an auto-compaction retry, or a queued follow-up.
     * Hooking `agent_end` therefore fires repeatedly during one long task and
     * claims you are needed when you are not.
     */
    pi.on("agent_settled", async (_event, ctx) => {
        if (!isAttended(ctx)) return;
        // Settled is not always idle: another extension may have started a new
        // run in response to this one, and notifying then is the same false
        // alarm one event later.
        if (!ctx.isIdle()) return;
        notify("Pi", "Ready for input");
    });
}
