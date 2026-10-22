import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { matchRunIds, parseWaitFlag, pickLatestRun, shouldRunAsync, subagentDepth } from "../_async.ts";
import type { MultiRun } from "../multirun.ts";

function run(id: string, over: Partial<MultiRun> = {}): MultiRun {
  return { id, kind: "plan", task: "t", cwd: "/repo", createdAt: "2026-10-18T00:00:00.000Z", members: [], ...over };
}

describe("shouldRunAsync", () => {
  it("defaults to background at top level", () => {
    assert.equal(shouldRunAsync(undefined, {}), true);
  });
  it("honors an explicit choice at top level", () => {
    assert.equal(shouldRunAsync(false, {}), false);
    assert.equal(shouldRunAsync(true, { PI_SUBAGENT_DEPTH: "0" }), true);
  });
  it("always blocks inside a subagent, even when async is requested", () => {
    assert.equal(shouldRunAsync(undefined, { PI_SUBAGENT_DEPTH: "1" }), false);
    assert.equal(shouldRunAsync(true, { PI_SUBAGENT_DEPTH: "2" }), false);
  });
  it("treats a malformed depth as top level", () => {
    assert.equal(subagentDepth({ PI_SUBAGENT_DEPTH: "x" }), 0);
  });
});

describe("parseWaitFlag", () => {
  it("removes --wait anywhere and keeps the rest", () => {
    assert.deepEqual(parseWaitFlag("--wait add auth"), { wait: true, rest: "add auth" });
    assert.deepEqual(parseWaitFlag("--pr --wait the api"), { wait: true, rest: "--pr the api" });
    assert.deepEqual(parseWaitFlag("  add  auth "), { wait: false, rest: "add auth" });
  });
});

describe("pickLatestRun", () => {
  // newest-first, as listRunIds returns them
  const runs = [
    run("c-running"), // started last, not delivered yet
    run("b", { deliveredAt: "2026-10-18T10:00:00.000Z" }),
    run("a", { deliveredAt: "2026-10-18T11:00:00.000Z" }), // started first, delivered last
  ];

  it("prefers the most recently delivered run over a newer undelivered one", () => {
    assert.equal(pickLatestRun(runs, "plan", "/repo")?.id, "a");
  });
  it("falls back to the newest run when none was delivered", () => {
    assert.equal(pickLatestRun([run("y"), run("x")], "plan", "/repo")?.id, "y");
  });
  it("prefers runs from the same cwd", () => {
    const mixed = [run("other", { cwd: "/elsewhere", deliveredAt: "2026-10-18T12:00:00.000Z" }), ...runs];
    assert.equal(pickLatestRun(mixed, "plan", "/repo")?.id, "a");
    assert.equal(pickLatestRun(mixed, "plan", "/nowhere")?.id, "other");
  });
  it("ignores other kinds", () => {
    assert.equal(pickLatestRun([run("r", { kind: "review" })], "plan"), undefined);
  });
});

describe("matchRunIds", () => {
  const active = ["20261018-100000-plan", "20261018-101500-plan"];
  it("stops the newest with no argument", () => {
    assert.deepEqual(matchRunIds(active, ""), { ids: ["20261018-101500-plan"] });
  });
  it("stops every run with all", () => {
    assert.deepEqual(matchRunIds(active, "all").ids, active);
  });
  it("accepts an exact id or a unique substring", () => {
    assert.deepEqual(matchRunIds(active, "20261018-100000-plan").ids, ["20261018-100000-plan"]);
    assert.deepEqual(matchRunIds(active, "1015").ids, ["20261018-101500-plan"]);
  });
  it("reports ambiguity, misses, and no active runs", () => {
    assert.match(matchRunIds(active, "plan").error ?? "", /several runs/);
    assert.match(matchRunIds(active, "zzz").error ?? "", /No active run/);
    assert.match(matchRunIds([], "").error ?? "", /No background runs/);
  });
});
