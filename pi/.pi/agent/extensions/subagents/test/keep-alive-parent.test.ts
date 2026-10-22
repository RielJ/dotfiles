// @ts-nocheck -- runtime tests use a minimal structural ExtensionAPI mock.
import assert from "node:assert/strict";
import { appendFileSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, it } from "node:test";
import subagentsExtension, { __test__ } from "../index.ts";
import { writeTurnSignal } from "../keep-alive.ts";
import { createStatusState } from "../status.ts";

const tempDirs: string[] = [];
afterEach(() => {
  __test__.runningSubagents.clear();
  for (const dir of tempDirs.splice(0))
    rmSync(dir, { recursive: true, force: true });
});

interface SentMessage {
  customType: string;
  content: string;
  details: Record<string, unknown>;
}

interface SendOptions {
  triggerTurn?: boolean;
  deliverAs?: string;
}

/** Install the extension against a mock API and capture sent messages. */
function installMock() {
  const sent: Array<{ message: SentMessage; options: SendOptions }> = [];
  subagentsExtension({
    on() {},
    registerTool() {},
    registerCommand() {},
    registerMessageRenderer() {},
    sendUserMessage() {},
    sendMessage(message: SentMessage, options: SendOptions) {
      sent.push({ message, options });
    },
  });
  return sent;
}

function sessionWithReply(text: string): string {
  const dir = mkdtempSync(join(tmpdir(), "subagent-keepalive-parent-"));
  tempDirs.push(dir);
  const session = join(dir, "child.jsonl");
  writeFileSync(
    session,
    `${JSON.stringify({ type: "session", id: "child-session" })}\n`,
  );
  appendAssistant(session, text);
  return session;
}

function appendAssistant(session: string, text: string): void {
  appendFileSync(
    session,
    `${JSON.stringify({
      type: "message",
      id: `m-${Math.random()}`,
      message: {
        role: "assistant",
        content: [{ type: "text", text }],
        stopReason: "stop",
      },
    })}\n`,
  );
}

function fakeRunning(session: string, extra: Record<string, unknown> = {}) {
  const running = {
    id: `id-${Math.random().toString(16).slice(2, 8)}`,
    name: `ka-test-${process.pid}`,
    task: "do a thing",
    surface: `ka-test-${process.pid}`,
    startTime: Date.now() - 5_000,
    sessionFile: session,
    interactive: false,
    keepAlive: true,
    deliveredEntryCount: 0,
    turnsDelivered: 0,
    statusState: createStatusState({ source: "pi", startTimeMs: Date.now() }),
    ...extra,
  };
  __test__.runningSubagents.set(running.id, running);
  return running;
}

describe("keep-alive turn delivery", () => {
  it("delivers each turn's result and parks the subagent", () => {
    const sent = installMock();
    const session = sessionWithReply("first answer");
    const running = fakeRunning(session);

    writeTurnSignal(session, { seq: 1, at: Date.now(), type: "done" });
    __test__.deliverTurnResult(running);

    assert.equal(sent.length, 1);
    const { message, options } = sent[0];
    assert.equal(message.customType, "subagent_result");
    assert.match(message.content, /first answer/);
    assert.match(message.content, /subagent_close\(\{ name: "ka-test-/);
    assert.equal(message.details.open, true);
    assert.deepEqual(options, { triggerTurn: true, deliverAs: "steer" });
    assert.equal(running.parked, true);
    assert.equal(running.turnsDelivered, 1);
    assert.equal(running.deliveredEntryCount, 2);

    // No new signal: nothing more is delivered.
    __test__.deliverTurnResult(running);
    assert.equal(sent.length, 1);

    // The next turn reports only its own reply.
    appendAssistant(session, "second answer");
    writeTurnSignal(session, { seq: 2, at: Date.now(), type: "done" });
    __test__.deliverTurnResult(running);
    assert.equal(sent.length, 2);
    assert.match(sent[1].message.content, /second answer/);
    assert.doesNotMatch(sent[1].message.content, /first answer/);
  });

  it("reports error turns as failures", () => {
    const sent = installMock();
    const session = sessionWithReply("partial");
    const running = fakeRunning(session);
    writeTurnSignal(session, {
      seq: 1,
      at: Date.now(),
      type: "error",
      errorMessage: "overloaded",
    });
    __test__.deliverTurnResult(running);
    assert.equal(sent[0].message.details.errorMessage, "overloaded");
    assert.equal(sent[0].message.details.exitCode, 1);
  });

  it("ignores one-shot subagents", () => {
    const sent = installMock();
    const session = sessionWithReply("x");
    const running = fakeRunning(session, { keepAlive: false });
    writeTurnSignal(session, { seq: 1, at: Date.now(), type: "done" });
    __test__.deliverTurnResult(running);
    assert.equal(sent.length, 0);
  });
});

describe("subagent_close", () => {
  it("refuses to close a subagent mid-turn without force", () => {
    installMock();
    const running = fakeRunning(sessionWithReply("x"), { parked: false });
    const result = __test__.closeSubagentByName({ name: running.name });
    assert.equal(result.details.error, "busy");
    assert.ok(__test__.runningSubagents.has(running.id));
  });

  it("closes a parked subagent and marks it orchestrator-closed", () => {
    installMock();
    const abort = new AbortController();
    const running = fakeRunning(sessionWithReply("x"), {
      parked: true,
      parkedSince: Date.now(),
      abortController: abort,
    });
    const result = __test__.closeSubagentByName({ name: running.name });
    assert.equal(result.details.status, "closed");
    assert.equal(result.details.forced, false);
    assert.equal(running.closeReason, "orchestrator");
    assert.equal(abort.signal.aborted, true);
    assert.equal(__test__.runningSubagents.has(running.id), false);
  });

  it("force-closes a busy subagent", () => {
    installMock();
    const running = fakeRunning(sessionWithReply("x"), { parked: false });
    const result = __test__.closeSubagentByName({
      name: running.name,
      force: true,
    });
    assert.equal(result.details.status, "closed");
    assert.equal(result.details.forced, true);
  });

  it("explains when there is nothing to close", () => {
    installMock();
    const result = __test__.closeSubagentByName({
      name: `nobody-${process.pid}`,
    });
    assert.match(result.details.error, /nothing to clean up/);
  });
});

describe("final delivery after exit", () => {
  const base = (extra = {}) => ({
    name: "worker",
    keepAlive: true,
    turnsDelivered: 1,
    deliveredEntryCount: 4,
    ...extra,
  });

  it("is silent when the orchestrator closed it", () => {
    assert.deepEqual(
      __test__.resolveFinalDelivery(base({ closeReason: "orchestrator" }), 4),
      { kind: "silent" },
    );
  });

  it("posts a notice for idle closes and quiet self-exits", () => {
    assert.equal(
      __test__.resolveFinalDelivery(base({ closeReason: "idle" }), 4).kind,
      "notice",
    );
    assert.equal(__test__.resolveFinalDelivery(base(), 4).kind, "notice");
  });

  it("delivers when there is undelivered work or no keep-alive", () => {
    assert.equal(__test__.resolveFinalDelivery(base(), 6).kind, "deliver");
    assert.equal(
      __test__.resolveFinalDelivery(base({ keepAlive: false }), 4).kind,
      "deliver",
    );
    assert.equal(
      __test__.resolveFinalDelivery(base({ turnsDelivered: 0 }), 4).kind,
      "deliver",
    );
  });
});
