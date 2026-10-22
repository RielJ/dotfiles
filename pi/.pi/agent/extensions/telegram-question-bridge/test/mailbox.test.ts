import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, describe, it } from "node:test";
import { createMailbox, type PendingQuestion, routeUpdate } from "../mailbox.ts";

const ALLOWED = new Set([42]);
const roots: string[] = [];
after(() => {
  for (const root of roots) rmSync(root, { recursive: true, force: true });
});

function tempRoot(): string {
  const root = mkdtempSync(join(tmpdir(), "tqb-"));
  roots.push(root);
  return root;
}

function pending(over: Partial<PendingQuestion> = {}): PendingQuestion {
  return {
    qid: "q1",
    pid: process.pid,
    chatId: 100,
    threadId: 7,
    messageIds: [555],
    createdAt: 1,
    expiresAt: Number.MAX_SAFE_INTEGER,
    ...over,
  };
}

function tap(data: string, over: { from?: number; chat?: number; thread?: number; messageId?: number } = {}) {
  return {
    update_id: 1,
    callback_query: {
      id: "cbq",
      from: { id: over.from ?? 42 },
      data,
      message: { message_id: over.messageId ?? 555, chat: { id: over.chat ?? 100 }, message_thread_id: over.thread ?? 7 },
    },
  };
}

function text(body: string, over: { from?: number; chat?: number; thread?: number } = {}) {
  return {
    update_id: 2,
    message: { message_id: 9, text: body, from: { id: over.from ?? 42 }, chat: { id: over.chat ?? 100 }, message_thread_id: over.thread ?? 7 },
  };
}

describe("mailbox", () => {
  it("relays events in order and cleans up on retract", () => {
    const box = createMailbox(tempRoot());
    box.publish(pending());
    assert.deepEqual(
      box.listPending().map((p) => p.qid),
      ["q1"],
    );
    box.postEvent("q1", { type: "pick", option: 1 });
    box.postEvent("q1", { type: "done" });
    assert.deepEqual(box.drainEvents("q1"), [{ type: "pick", option: 1 }, { type: "done" }]);
    assert.deepEqual(box.drainEvents("q1"), []);
    box.retract("q1");
    assert.deepEqual(box.listPending(), []);
  });

  it("is shared across mailbox instances on the same root (leader/follower)", () => {
    const root = tempRoot();
    const owner = createMailbox(root);
    const leader = createMailbox(root);
    owner.publish(pending());
    leader.postEvent(leader.listPending()[0]!.qid, { type: "skip" });
    assert.deepEqual(owner.drainEvents("q1"), [{ type: "skip" }]);
  });

  it("drops expired questions and questions whose owner process died", () => {
    const box = createMailbox(tempRoot(), (pid) => pid !== 999);
    box.publish(pending({ qid: "old", expiresAt: 10 }));
    box.publish(pending({ qid: "dead", pid: 999 }));
    box.publish(pending({ qid: "live" }));
    assert.deepEqual(
      box.listPending(100).map((p) => p.qid),
      ["live"],
    );
  });
});

describe("routeUpdate", () => {
  const open = [pending()];

  it("claims a tap on the pending message", () => {
    assert.deepEqual(routeUpdate(tap("aq1:q1:o2"), open, ALLOWED), {
      kind: "event",
      qid: "q1",
      event: { type: "pick", option: 2 },
      callbackQueryId: "cbq",
    });
  });

  it("passes foreign callbacks and taps from strangers", () => {
    assert.deepEqual(routeUpdate(tap("tgbtn:x"), open, ALLOWED), { kind: "pass" });
    assert.deepEqual(routeUpdate(tap("aq1:q1:o0", { from: 7 }), open, ALLOWED), { kind: "pass" });
  });

  it("marks taps on unknown, moved, or other-thread questions stale", () => {
    for (const update of [
      tap("aq1:gone:o0"),
      tap("aq1:q1:o0", { messageId: 1 }),
      tap("aq1:q1:o0", { thread: 8 }),
      tap("aq1:q1:o0", { chat: 101 }),
      tap("aq1:q1:bogus"),
    ]) {
      assert.equal(routeUpdate(update, open, ALLOWED).kind, "stale-callback");
    }
  });

  it("claims a plain reply in the question's thread as a typed answer, newest question first", () => {
    const two = [pending(), pending({ qid: "q2", createdAt: 5, messageIds: [600] })];
    assert.deepEqual(routeUpdate(text(" use redis "), two, ALLOWED), {
      kind: "event",
      qid: "q2",
      event: { type: "text", text: "use redis" },
    });
  });

  it("passes commands, strangers, other threads, and chats with nothing pending", () => {
    assert.deepEqual(routeUpdate(text("/stop"), open, ALLOWED), { kind: "pass" });
    assert.deepEqual(routeUpdate(text("hi", { from: 7 }), open, ALLOWED), { kind: "pass" });
    assert.deepEqual(routeUpdate(text("hi", { thread: 8 }), open, ALLOWED), { kind: "pass" });
    assert.deepEqual(routeUpdate(text("hi"), [], ALLOWED), { kind: "pass" });
    assert.deepEqual(routeUpdate({ edited_message: { text: "x" } }, open, ALLOWED), { kind: "pass" });
  });

  it("matches any thread in the chat when the question has no thread", () => {
    const route = routeUpdate(text("ok", { thread: 3 }), [pending({ threadId: undefined })], ALLOWED);
    assert.equal(route.kind, "event");
  });
});
