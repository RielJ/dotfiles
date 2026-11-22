/**
 * In-memory pause switch for the approval prompt. It never touches disk, so a pause ends with
 * the session or a /reload, and it cannot leak into subagents or other pi processes.
 * Hard rules ignore it: a paused gate still blocks them.
 */

export const DIALOG_PAUSE_MS = 15 * 60_000;
const MAX_PAUSE_MS = 24 * 60 * 60_000;

export type PauseState =
  | { kind: "on" }
  | { kind: "paused"; until: number | null };

const UNIT_MS: Record<string, number> = { s: 1000, m: 60_000, h: 3_600_000 };

/**
 * Parses "90s", "10m", "1h", "1h30m", or a bare number of minutes.
 * Returns milliseconds, or an error message for the user.
 */
export function parseDuration(
  text: string,
): { ms: number } | { error: string } {
  const input = text.trim().toLowerCase();
  let ms = 0;
  if (/^\d+$/.test(input)) {
    ms = Number(input) * UNIT_MS.m;
  } else if (/^(\d+[smh])+$/.test(input)) {
    for (const [, n, unit] of input.matchAll(/(\d+)([smh])/g))
      ms += Number(n) * UNIT_MS[unit];
  } else {
    return { error: `"${text}" is not a duration. Use 30s, 10m, 1h or 1h30m.` };
  }
  if (ms <= 0) return { error: "Duration must be longer than zero." };
  if (ms > MAX_PAUSE_MS)
    return {
      error: "Longest timed pause is 24h. Use plain `off` to pause until `on`.",
    };
  return { ms };
}

export function formatDuration(ms: number): string {
  const totalMin = Math.ceil(ms / 60_000);
  if (totalMin < 60) return `${totalMin}m`;
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  return m === 0 ? `${h}h` : `${h}h${m}m`;
}

export class PauseSwitch {
  private state: PauseState = { kind: "on" };
  private readonly now: () => number;

  constructor(now: () => number = Date.now) {
    this.now = now;
  }

  /** Pauses for `ms`, or until resume() when `ms` is null. */
  pause(ms: number | null): void {
    this.state = {
      kind: "paused",
      until: ms === null ? null : this.now() + ms,
    };
  }

  resume(): void {
    this.state = { kind: "on" };
  }

  /** Current state; a timed pause that has run out reads as "on". */
  current(): PauseState {
    if (
      this.state.kind === "paused" &&
      this.state.until !== null &&
      this.now() >= this.state.until
    ) {
      this.state = { kind: "on" };
    }
    return this.state;
  }

  isPaused(): boolean {
    return this.current().kind === "paused";
  }

  describe(): string {
    const s = this.current();
    if (s.kind === "on")
      return "Damage control is on: risky commands ask for approval.";
    const left =
      s.until === null
        ? "until `/damage-control on`"
        : `for ${formatDuration(s.until - this.now())} more`;
    return `Damage control prompts are paused ${left}. Risky commands run without asking; hard rules still block.`;
  }

  /** Short footer text, or undefined when on. */
  statusText(): string | undefined {
    const s = this.current();
    if (s.kind === "on") return undefined;
    if (s.until === null) return "⚠ damage-control paused";
    const at = new Date(s.until).toTimeString().slice(0, 5);
    return `⚠ damage-control paused until ${at}`;
  }
}
