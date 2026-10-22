import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import type { ExtensionContext } from "@earendil-works/pi-coding-agent";
import { visibleWidth } from "@earendil-works/pi-tui";
import { externalRowsHost, type LiveRun, RunTracker, renderRunBoxes, runRows } from "../_background.ts";

const strip = (s: string) => s.replace(/\x1b\[[0-9;]*m/g, "");

function live(over: Partial<LiveRun> = {}): LiveRun {
  return {
    id: "r3k2",
    startedAt: 0,
    phase: "planning",
    agents: new Map([
      ["Explorer", { status: "done", activity: "context 3.2KB", startedAt: 0, elapsed: 41_000 }],
      ["Opus 5.5", { status: "running", activity: "read plan.ts", startedAt: 10_000, elapsed: 0 }],
    ]),
    controller: new AbortController(),
    stopped: false,
    ...over,
  };
}

function fakeCtx() {
  const widgets = new Map<string, unknown>();
  const ctx = {
    ui: {
      setWidget(key: string, value: unknown) {
        if (value === undefined) widgets.delete(key);
        else widgets.set(key, value);
      },
    },
  } as unknown as ExtensionContext;
  return { ctx, widgets };
}

afterEach(() => {
  const host = externalRowsHost();
  host.sources.clear();
  host.refresh = undefined;
});

describe("runRows", () => {
  it("emits one row per model, tagged with its run", () => {
    assert.deepEqual(runRows([live()], "plan"), [
      { status: "done", startedAt: 0, elapsedMs: 41_000, name: "Explorer", tag: "plan r3k2", detail: "context 3.2KB" },
      { status: "running", startedAt: 10_000, elapsedMs: 0, name: "Opus 5.5", tag: "plan r3k2", detail: "read plan.ts" },
    ]);
  });

  it("marks models cut off by a stopped run and freezes their time", () => {
    const [, opus] = runRows([live({ finishedAt: 70_000, phase: "stopped" })], "plan");
    assert.deepEqual(opus, { status: "error", startedAt: 10_000, elapsedMs: 60_000, name: "Opus 5.5", tag: "plan r3k2", detail: "stopped" });
  });

  it("uses a run's own tag for follow-ups", () => {
    const rows = runRows([live({ tag: "plan r3k2 follow-up" })], "plan");
    assert.equal(rows[0]?.tag, "plan r3k2 follow-up");
  });
});

describe("RunTracker hosting", () => {
  it("publishes rows into the Subagents host instead of drawing its own box", () => {
    let refreshes = 0;
    externalRowsHost().refresh = () => refreshes++;
    const { ctx, widgets } = fakeCtx();
    const tracker = new RunTracker({ widgetKey: "planner", title: "Plan", noun: "plan", isEnabled: () => true });
    tracker.setContext(ctx);

    const run = tracker.begin("abcd");
    tracker.setAgent(run, "GLM 5.2", { activity: "thinking" });

    assert.ok(refreshes >= 2);
    assert.equal(widgets.has("planner"), false);
    const rows = externalRowsHost().sources.get("planner")?.();
    assert.deepEqual(
      rows?.map((r) => [r.name, r.tag, r.detail]),
      [["GLM 5.2", "plan abcd", "thinking"]],
    );

    tracker.abortAll();
    assert.equal(externalRowsHost().sources.has("planner"), false);
  });

  it("falls back to its own box when the subagents extension is absent", () => {
    const { ctx, widgets } = fakeCtx();
    const tracker = new RunTracker({ widgetKey: "planner", title: "Plan", noun: "plan", isEnabled: () => true });
    tracker.setContext(ctx);
    tracker.begin("abcd");
    assert.equal(widgets.has("planner"), true);
    assert.equal(externalRowsHost().sources.has("planner"), false);
    tracker.abortAll();
  });

  it("stop() cancels a follow-up by its id", () => {
    externalRowsHost().refresh = () => {};
    const tracker = new RunTracker({ widgetKey: "planner", title: "Plan", noun: "plan", isEnabled: () => true });
    const follow = tracker.begin("r3k2-a1", undefined, "plan r3k2 follow-up");
    assert.deepEqual(tracker.stop("r3k2-a1").stopped, ["r3k2-a1"]);
    assert.equal(follow.controller.signal.aborted, true);
    tracker.abortAll();
  });
});

describe("renderRunBoxes (fallback)", () => {
  it("draws an exact-width box", () => {
    const lines = renderRunBoxes([live()], "Plan", 60, 40_000);
    assert.equal(lines.length, 4);
    for (const line of lines) assert.equal(visibleWidth(line), 60);
    assert.match(strip(lines[0] ?? ""), /^╭─ Plan r3k2 ─+ planning · 00:40 ─╮$/);
    assert.match(strip(lines[2] ?? ""), /^│ ⟳ 00:30  Opus 5\.5 +read plan\.ts │$/);
  });
});
