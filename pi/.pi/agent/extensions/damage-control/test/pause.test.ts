import assert from "node:assert/strict";
import { describe, test } from "node:test";

import { formatDuration, PauseSwitch, parseDuration } from "../pause.ts";

describe("parseDuration", () => {
  test("accepts units, combos and bare minutes", () => {
    assert.deepEqual(parseDuration("30s"), { ms: 30_000 });
    assert.deepEqual(parseDuration("10m"), { ms: 600_000 });
    assert.deepEqual(parseDuration("1h30m"), { ms: 5_400_000 });
    assert.deepEqual(parseDuration("15"), { ms: 900_000 });
    assert.deepEqual(parseDuration(" 2H "), { ms: 7_200_000 });
  });
  test("rejects junk, zero and over 24h", () => {
    for (const bad of ["soon", "10 minutes", "-5m", "1d", "", "0m", "25h"]) {
      assert.ok("error" in parseDuration(bad), bad);
    }
  });
});

describe("formatDuration", () => {
  test("rounds up to minutes", () => {
    assert.equal(formatDuration(1), "1m");
    assert.equal(formatDuration(15 * 60_000), "15m");
    assert.equal(formatDuration(90 * 60_000), "1h30m");
    assert.equal(formatDuration(120 * 60_000), "2h");
  });
});

describe("PauseSwitch", () => {
  test("starts on", () => {
    const p = new PauseSwitch(() => 0);
    assert.equal(p.isPaused(), false);
    assert.equal(p.statusText(), undefined);
  });
  test("timed pause expires on its own", () => {
    let now = 1_000;
    const p = new PauseSwitch(() => now);
    p.pause(60_000);
    assert.equal(p.isPaused(), true);
    assert.match(p.describe(), /for 1m more/);
    now += 59_999;
    assert.equal(p.isPaused(), true);
    now += 1;
    assert.equal(p.isPaused(), false);
    assert.deepEqual(p.current(), { kind: "on" });
  });
  test("open-ended pause lasts until resume", () => {
    let now = 0;
    const p = new PauseSwitch(() => now);
    p.pause(null);
    now += 365 * 24 * 3_600_000;
    assert.equal(p.isPaused(), true);
    assert.equal(p.statusText(), "⚠ damage-control paused");
    p.resume();
    assert.equal(p.isPaused(), false);
  });
  test("a new pause replaces the old deadline", () => {
    let now = 0;
    const p = new PauseSwitch(() => now);
    p.pause(60_000);
    p.pause(10_000);
    now = 20_000;
    assert.equal(p.isPaused(), false);
  });
});
