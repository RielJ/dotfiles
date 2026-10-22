/**
 * Live state for /plan and /review runs, one entry per run id.
 *
 * Several runs can be in flight at once. Each has its own AbortController,
 * phase, and per-model rows; the widget renders every active run. Finished
 * runs stay visible for a few seconds, then drop off.
 */
import type { ExtensionContext } from "@earendil-works/pi-coding-agent";
import { truncateToWidth, visibleWidth } from "@earendil-works/pi-tui";
import { matchRunIds } from "./_async.js";

const LINGER_MS = 8000;

// Same raw colors as the subagents widget (extensions/subagents/index.ts), so
// both boxes look identical above the editor.
const ACCENT = "\x1b[38;2;77;163;255m";
const GREEN = "\x1b[38;2;126;186;103m";
const YELLOW = "\x1b[38;2;214;181;94m";
const RED = "\x1b[38;2;224;108;117m";
const DIM = "\x1b[38;2;128;128;128m";
const RST = "\x1b[0m";

function mmss(ms: number): string {
  const seconds = Math.max(0, Math.floor(ms / 1000));
  return `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
}

function boxTop(title: string, info: string, width: number): string {
  if (width < 2) return "";
  const inner = width - 2;
  const left = `─ ${title} `;
  const right = ` ${info} ─`;
  const fill = Math.max(0, inner - visibleWidth(left) - visibleWidth(right));
  const content = truncateToWidth(`${left}${"─".repeat(fill)}${right}`, inner, "");
  return `${ACCENT}╭${content}${"─".repeat(Math.max(0, inner - visibleWidth(content)))}╮${RST}`;
}

function boxRow(left: string, right: string, width: number): string {
  if (width < 2) return "";
  const inner = width - 2;
  const rightPart = truncateToWidth(right, inner, "…");
  const leftPart = truncateToWidth(left, Math.max(0, inner - visibleWidth(rightPart)), "…");
  const pad = Math.max(0, inner - visibleWidth(leftPart) - visibleWidth(rightPart));
  return `${ACCENT}│${RST}${leftPart}${" ".repeat(pad)}${rightPart}${ACCENT}│${RST}`;
}

function boxBottom(width: number): string {
  return width < 2 ? "" : `${ACCENT}╰${"─".repeat(width - 2)}╯${RST}`;
}

const ICON: Record<AgentRow["status"], string> = {
  running: `${YELLOW}⟳${RST}`,
  done: `${GREEN}✓${RST}`,
  error: `${RED}✗${RST}`,
};

/**
 * One subagents-style box per run:
 *
 *   ╭─ Plan r3k2 ─────────────────── planning · 01:12 ─╮
 *   │ ✓ 00:41  Explorer                 context 3.2KB  │
 *   │ ⟳ 00:30  Opus 5.5                  read plan.ts  │
 *   ╰──────────────────────────────────────────────────╯
 */
export function renderRunBoxes(runs: readonly LiveRun[], title: string, width: number, now: number): string[] {
  const lines: string[] = [];
  for (const run of runs) {
    const elapsed = mmss((run.finishedAt ?? now) - run.startedAt);
    lines.push(boxTop(`${title} ${run.id}`, `${run.phase} · ${elapsed}`, width));
    for (const [label, row] of run.agents) {
      const running = row.status === "running" && !run.finishedAt;
      const icon = running || row.status !== "running" ? ICON[row.status] : `${DIM}○${RST}`;
      const ms = running ? now - row.startedAt : row.elapsed;
      const activity = row.activity ? ` ${DIM}${row.activity}${RST} ` : " ";
      lines.push(boxRow(` ${icon} ${mmss(ms)}  ${label} `, activity, width));
    }
    lines.push(boxBottom(width));
  }
  return lines;
}

export interface AgentRow {
  status: "running" | "done" | "error";
  activity: string;
  startedAt: number;
  elapsed: number;
}

export interface LiveRun {
  id: string;
  /** Overrides the default "<noun> <id>" tag on this run's rows (follow-ups). */
  tag?: string;
  startedAt: number;
  phase: string;
  agents: Map<string, AgentRow>;
  controller: AbortController;
  /** True once /plan-stop, /review-stop, or session shutdown cancelled the run. */
  stopped: boolean;
  finishedAt?: number;
}

// ── Subagents widget host ──
// Contract owned by extensions/subagents/index.ts ("External rows"): when the
// subagents extension is loaded it sets `refresh`, and our rows render inside
// its "Subagents" box. Without it we fall back to our own box.

export interface ExternalWidgetRow {
  status: "running" | "done" | "error";
  startedAt: number;
  elapsedMs?: number;
  name: string;
  tag?: string;
  detail?: string;
}

interface ExternalRowsHost {
  sources: Map<string, () => ExternalWidgetRow[]>;
  refresh?: () => void;
}

const EXTERNAL_ROWS_KEY = Symbol.for("pi-subagents/external-rows");

export function externalRowsHost(): ExternalRowsHost {
  const g = globalThis as Record<symbol, ExternalRowsHost | undefined>;
  g[EXTERNAL_ROWS_KEY] ??= { sources: new Map() };
  return g[EXTERNAL_ROWS_KEY];
}

/** Rows for the Subagents box: one per model, tagged with its run. */
export function runRows(runs: readonly LiveRun[], noun: string): ExternalWidgetRow[] {
  const rows: ExternalWidgetRow[] = [];
  for (const run of runs) {
    for (const [label, row] of run.agents) {
      // A run that ended while this model was still going (stop, failure).
      const cut = run.finishedAt !== undefined && row.status === "running";
      rows.push({
        status: cut ? "error" : row.status,
        startedAt: row.startedAt,
        elapsedMs: cut ? (run.finishedAt as number) - row.startedAt : row.elapsed,
        name: label,
        tag: run.tag ?? `${noun} ${run.id}`,
        detail: cut ? run.phase : row.activity,
      });
    }
  }
  return rows;
}

function unref(handle: unknown): void {
  if (handle && typeof handle === "object" && "unref" in handle) (handle as { unref?: () => void }).unref?.();
}

export class RunTracker {
  private readonly runs = new Map<string, LiveRun>();
  private ctx: ExtensionContext | undefined;
  private timer: ReturnType<typeof setInterval> | undefined;

  private readonly opts: { widgetKey: string; title: string; noun: string; isEnabled: () => boolean };

  constructor(opts: { widgetKey: string; title: string; noun: string; isEnabled: () => boolean }) {
    this.opts = opts;
  }

  setContext(ctx: ExtensionContext): void {
    this.ctx = ctx;
  }

  /** Register a run. An external signal (a blocking tool call's) also aborts it. */
  begin(id: string, external?: AbortSignal, tag?: string): LiveRun {
    const controller = new AbortController();
    if (external) {
      if (external.aborted) controller.abort();
      else external.addEventListener("abort", () => controller.abort(), { once: true });
    }
    const live: LiveRun = {
      id,
      ...(tag ? { tag } : {}),
      startedAt: Date.now(),
      phase: "starting",
      agents: new Map(),
      controller,
      stopped: false,
    };
    this.runs.set(id, live);
    if (!this.timer) {
      this.timer = setInterval(() => this.render(), 1000);
      unref(this.timer);
    }
    this.render();
    return live;
  }

  setPhase(live: LiveRun, phase: string): void {
    live.phase = phase;
    this.render();
  }

  setAgent(live: LiveRun, label: string, patch: Partial<Omit<AgentRow, "startedAt">>): void {
    const prev = live.agents.get(label);
    const now = Date.now();
    const next: AgentRow = { status: "running", activity: "", elapsed: 0, ...prev, ...patch, startedAt: prev?.startedAt ?? now };
    if (next.status !== "running" && patch.elapsed === undefined) next.elapsed = now - next.startedAt;
    live.agents.set(label, next);
    this.render();
  }

  finish(live: LiveRun, phase: string): void {
    if (live.finishedAt) return;
    live.phase = phase;
    live.finishedAt = Date.now();
    this.render();
    const t = setTimeout(() => {
      this.runs.delete(live.id);
      this.render();
    }, LINGER_MS);
    unref(t);
  }

  /** Ids of runs still in flight, oldest first. */
  activeIds(): string[] {
    return [...this.runs.values()].filter((r) => !r.finishedAt).map((r) => r.id);
  }

  /** Cancel runs by id, unique substring, "all", or (empty) the newest. */
  stop(arg: string): { stopped: string[]; error?: string } {
    const { ids, error } = matchRunIds(this.activeIds(), arg);
    for (const id of ids) {
      const live = this.runs.get(id);
      if (!live) continue;
      live.stopped = true;
      live.controller.abort();
      this.finish(live, "stopped");
    }
    return { stopped: ids, ...(error ? { error } : {}) };
  }

  /** Session is ending: kill every child process and drop all state. */
  abortAll(): void {
    for (const live of this.runs.values()) {
      if (live.finishedAt) continue;
      live.stopped = true;
      live.controller.abort();
    }
    this.runs.clear();
    if (this.timer) clearInterval(this.timer);
    this.timer = undefined;
    const host = externalRowsHost();
    host.sources.delete(this.opts.widgetKey);
    host.refresh?.();
    try {
      this.ctx?.ui.setWidget(this.opts.widgetKey, undefined);
    } catch {
      // The session context may already be torn down.
    }
    this.ctx = undefined;
  }

  private render(): void {
    if (this.runs.size === 0 && this.timer) {
      clearInterval(this.timer);
      this.timer = undefined;
    }
    const host = externalRowsHost();
    if (host.refresh) {
      // Hosted inside the Subagents box; the provider reads live state so its
      // own 1s refresh keeps elapsed times ticking.
      if (this.runs.size === 0 || !this.opts.isEnabled()) host.sources.delete(this.opts.widgetKey);
      else host.sources.set(this.opts.widgetKey, () => runRows([...this.runs.values()], this.opts.noun));
      host.refresh();
      this.ctx?.ui.setWidget(this.opts.widgetKey, undefined);
      return;
    }
    host.sources.delete(this.opts.widgetKey);
    if (!this.ctx || !this.opts.isEnabled()) return;
    if (this.runs.size === 0) {
      this.ctx.ui.setWidget(this.opts.widgetKey, undefined);
      return;
    }
    const runs = [...this.runs.values()];
    const title = this.opts.title;
    this.ctx.ui.setWidget(
      this.opts.widgetKey,
      () => ({
        render: (width: number) => renderRunBoxes(runs, title, width, Date.now()),
        invalidate() {},
        dispose() {},
      }),
      { placement: "aboveEditor" },
    );
  }
}
