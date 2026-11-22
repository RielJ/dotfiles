/**
 * openViewer issues the right tmux commands and never throws, so a tmux
 * problem can't break a plan/review run.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  IDLE_WINDOW,
  memberViewer,
  openViewer,
  POOL_SESSION,
} from "../_tmux-viewer.ts";

const OPTS = {
  window: "plan-043707-a",
  label: "Opus 5.5 (20261122-043707-plan)",
  logPath: "/runs/plan-a.stream.ndjson",
  pid: 4242,
  cwd: "/repo",
};
const TMUX_ENV = { TMUX: "/tmp/tmux-501/default,1,0" };

function recorder(fail: (args: string[]) => boolean = () => false) {
  const calls: string[][] = [];
  const run = (args: string[]) => {
    calls.push(args);
    if (fail(args)) throw new Error(`tmux ${args[0]} failed`);
  };
  return { calls, run };
}

describe("memberViewer", () => {
  it("names windows by kind, run time and member", () => {
    assert.deepEqual(memberViewer("20261122-043707-plan", "A", "Opus 5.5"), {
      window: "plan-043707-a",
      label: "Opus 5.5 (20261122-043707-plan)",
    });
    assert.equal(
      memberViewer("20261122-043707-review", "explorer", "Explorer").window,
      "review-043707-explorer",
    );
    assert.equal(memberViewer("odd id", "B", "x").window, "odd-id-b");
  });
});

describe("openViewer", () => {
  it("does nothing outside tmux", () => {
    const { calls, run } = recorder();
    assert.equal(openViewer(OPTS, run, {}), false);
    assert.deepEqual(calls, []);
  });

  it("reuses the pool, replaces a same-name window, runs the viewer, and drops the idle window", () => {
    const { calls, run } = recorder();
    assert.equal(openViewer(OPTS, run, TMUX_ENV), true);
    assert.deepEqual(
      calls.map((c) => c[0]),
      ["has-session", "kill-window", "new-window", "kill-window"],
    );
    const nw = calls[2];
    assert.deepEqual(nw.slice(0, 8), [
      "new-window",
      "-d",
      "-t",
      `=${POOL_SESSION}:`,
      "-n",
      OPTS.window,
      "-c",
      OPTS.cwd,
    ]);
    assert.match(nw[9], /_stream-viewer\.ts$/);
    assert.deepEqual(nw.slice(10), [OPTS.logPath, "4242", OPTS.label]);
    assert.deepEqual(calls[3], [
      "kill-window",
      "-t",
      `=${POOL_SESSION}:=${IDLE_WINDOW}`,
    ]);
  });

  it("creates the pool with a named idle window when it is missing", () => {
    const { calls, run } = recorder(
      (args) => args[0] === "has-session" || args[0] === "kill-window",
    );
    assert.equal(openViewer(OPTS, run, TMUX_ENV), true);
    assert.deepEqual(calls[1].slice(0, 6), [
      "new-session",
      "-d",
      "-s",
      POOL_SESSION,
      "-n",
      IDLE_WINDOW,
    ]);
  });

  it("returns false instead of throwing when tmux fails", () => {
    const { run } = recorder((args) => args[0] === "new-window");
    assert.equal(openViewer(OPTS, run, TMUX_ENV), false);
  });
});
