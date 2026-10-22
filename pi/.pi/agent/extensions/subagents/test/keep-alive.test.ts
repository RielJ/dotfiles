import assert from "node:assert/strict";
import { existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, it } from "node:test";
import {
  DEFAULT_KEEP_ALIVE_CONFIG,
  consumeTurnSignal,
  loadKeepAliveConfig,
  parseKeepAliveConfig,
  resolveAgentEndAction,
  resolveKeepAlive,
  shouldIdleClose,
  turnSignalPath,
  writeTurnSignal,
} from "../keep-alive.ts";

const tempDirs: string[] = [];
afterEach(() => {
  for (const dir of tempDirs.splice(0))
    rmSync(dir, { recursive: true, force: true });
});

function tempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), "subagent-keepalive-"));
  tempDirs.push(dir);
  return dir;
}

describe("keep-alive config", () => {
  it("defaults to enabled with a 30 minute idle close", () => {
    assert.deepEqual(parseKeepAliveConfig({}), {
      enabled: true,
      idleCloseMinutes: 30,
    });
    assert.deepEqual(parseKeepAliveConfig(null), DEFAULT_KEEP_ALIVE_CONFIG);
  });

  it("reads explicit values and ignores invalid ones", () => {
    assert.deepEqual(
      parseKeepAliveConfig({ keepAlive: { enabled: false, idleCloseMinutes: 0 } }),
      { enabled: false, idleCloseMinutes: 0 },
    );
    assert.deepEqual(
      parseKeepAliveConfig({ keepAlive: { enabled: "no", idleCloseMinutes: -5 } }),
      DEFAULT_KEEP_ALIVE_CONFIG,
    );
  });

  it("loads the first existing file and survives bad JSON", () => {
    const dir = tempDir();
    const good = join(dir, "config.json");
    writeFileSync(good, JSON.stringify({ keepAlive: { idleCloseMinutes: 5 } }));
    assert.equal(
      loadKeepAliveConfig([join(dir, "missing.json"), good]).idleCloseMinutes,
      5,
    );
    const bad = join(dir, "bad.json");
    writeFileSync(bad, "{not json");
    assert.deepEqual(loadKeepAliveConfig([bad]), DEFAULT_KEEP_ALIVE_CONFIG);
    assert.deepEqual(loadKeepAliveConfig([]), DEFAULT_KEEP_ALIVE_CONFIG);
  });
});

describe("resolveKeepAlive", () => {
  const config = DEFAULT_KEEP_ALIVE_CONFIG;
  it("applies only to autonomous pi agents", () => {
    assert.equal(resolveKeepAlive({ autoExit: true, config }), true);
    assert.equal(resolveKeepAlive({ autoExit: false, config }), false);
    assert.equal(
      resolveKeepAlive({ autoExit: true, cli: "claude", config }),
      false,
    );
  });

  it("lets the spawn override the config default", () => {
    assert.equal(
      resolveKeepAlive({ autoExit: true, requested: false, config }),
      false,
    );
    assert.equal(
      resolveKeepAlive({
        autoExit: true,
        requested: true,
        config: { enabled: false, idleCloseMinutes: 30 },
      }),
      true,
    );
  });
});

describe("turn signal sidecar", () => {
  it("round-trips once and is removed after reading", () => {
    const session = join(tempDir(), "child.jsonl");
    writeTurnSignal(session, { seq: 1, at: 123, type: "done" });
    assert.ok(existsSync(turnSignalPath(session)));
    assert.deepEqual(consumeTurnSignal(session), {
      seq: 1,
      at: 123,
      type: "done",
    });
    assert.equal(existsSync(turnSignalPath(session)), false);
    assert.equal(consumeTurnSignal(session), null);
  });

  it("carries error details", () => {
    const session = join(tempDir(), "child.jsonl");
    writeTurnSignal(session, {
      seq: 2,
      at: 5,
      type: "error",
      errorMessage: "overloaded",
    });
    assert.equal(consumeTurnSignal(session)?.errorMessage, "overloaded");
  });

  it("drops malformed signals", () => {
    const session = join(tempDir(), "child.jsonl");
    writeFileSync(turnSignalPath(session), "{oops");
    assert.equal(consumeTurnSignal(session), null);
    assert.equal(existsSync(turnSignalPath(session)), false);
    writeFileSync(turnSignalPath(session), JSON.stringify({ type: "maybe" }));
    assert.equal(consumeTurnSignal(session), null);
  });
});

describe("resolveAgentEndAction", () => {
  const base = {
    autoExit: true,
    keepAlive: true,
    awaitingAnswer: false,
    pendingChildren: false,
    turnCompleted: true,
  };

  it("reports a completed turn for keep-alive agents", () => {
    assert.equal(resolveAgentEndAction(base), "report");
  });

  it("exits legacy auto-exit agents", () => {
    assert.equal(resolveAgentEndAction({ ...base, keepAlive: false }), "exit");
  });

  it("waits while a question or child is pending, or after an abort", () => {
    assert.equal(
      resolveAgentEndAction({ ...base, awaitingAnswer: true }),
      "wait",
    );
    assert.equal(
      resolveAgentEndAction({ ...base, pendingChildren: true }),
      "wait",
    );
    assert.equal(
      resolveAgentEndAction({ ...base, turnCompleted: false }),
      "wait",
    );
  });

  it("leaves interactive agents alone", () => {
    assert.equal(
      resolveAgentEndAction({ ...base, autoExit: false, keepAlive: false }),
      "wait",
    );
  });
});

describe("shouldIdleClose", () => {
  it("closes after the configured idle minutes", () => {
    assert.equal(shouldIdleClose(0, 29 * 60_000, 30), false);
    assert.equal(shouldIdleClose(0, 30 * 60_000, 30), true);
  });

  it("never closes when disabled or not parked", () => {
    assert.equal(shouldIdleClose(0, 10 ** 12, 0), false);
    assert.equal(shouldIdleClose(undefined, 10 ** 12, 30), false);
  });
});
