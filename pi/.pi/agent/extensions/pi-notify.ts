/**
 * Pi Notify Extension
 *
 * Sends a native notification + sound when Pi finishes and is waiting for input,
 * but ONLY when the terminal is not focused (you're in another app).
 *
 * macOS: osascript notification + afplay sound
 * Windows: PowerShell toast notification
 * Linux: falls back to OSC terminal escape sequences
 *
 * Environment variables:
 *   PI_NOTIFY_SOUND      — path to sound file (default: /System/Library/Sounds/Glass.aiff)
 *   PI_NOTIFY_SOUND_CMD  — custom command to play sound (overrides PI_NOTIFY_SOUND)
 */

import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
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

export default function (pi: ExtensionAPI) {
    pi.on("agent_end", async () => {
        notify("Pi", "Ready for input");
    });
}
