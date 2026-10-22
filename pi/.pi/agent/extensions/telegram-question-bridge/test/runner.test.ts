import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, describe, it } from "node:test";
import { createMailbox, type Mailbox } from "../mailbox.ts";
import type { AnswerEvent, QuestionParams } from "../questionnaire.ts";
import { type RunnerDeps, runTelegramQuestionnaire } from "../runner.ts";
import type { TelegramHandle, TelegramView } from "../telegram.ts";

const roots: string[] = [];
after(() => {
  for (const root of roots) rmSync(root, { recursive: true, force: true });
});

const params: QuestionParams = {
  questions: [
    { question: "Which DB?", header: "DB", options: [{ label: "Postgres", description: "" }, { label: "SQLite", description: "" }] },
    {
      question: "Which extras?",
      header: "Extras",
      multiSelect: true,
      options: [{ label: "Cache", description: "" }, { label: "Queue", description: "" }, { label: "Search", description: "" }],
    },
  ],
};

/**
 * Fake Telegram: each poll tick delivers the next scripted event batch to the
 * question currently pending, through the real file mailbox (as the leader would).
 */
function harness(script: AnswerEvent[][], over: Partial<RunnerDeps> = {}) {
  const root = mkdtempSync(join(tmpdir(), "tqb-run-"));
  roots.push(root);
  const mailbox: Mailbox = createMailbox(root);
  const sent: TelegramView[] = [];
  const edits: TelegramView[] = [];
  let clock = 0;
  let qidCounter = 0;
  const deps: RunnerDeps = {
    mailbox,
    async sendView(view) {
      sent.push(view);
      const handle: TelegramHandle = { target: { chatId: 1, threadId: 2 }, messageIds: [sent.length], generation: "g" };
      return { ok: true, value: handle };
    },
    async editView(handle, view) {
      edits.push(view);
      return { ok: true, value: handle };
    },
    newQid: () => `q${++qidCounter}`,
    now: () => clock,
    async sleep(ms) {
      clock += ms;
      const batch = script.shift();
      const open = mailbox.listPending(clock);
      if (batch && open[0]) for (const event of batch) mailbox.postEvent(open[0].qid, event);
    },
    pollMs: 100,
    timeoutMs: 10_000,
    ...over,
  };
  return { deps, sent, edits, mailbox };
}

describe("runTelegramQuestionnaire", () => {
  it("asks questions in sequence and returns the rpiv envelope", async () => {
    const h = harness([[{ type: "pick", option: 1 }], [{ type: "pick", option: 0 }], [{ type: "pick", option: 2 }], [{ type: "done" }]]);
    const result = await runTelegramQuestionnaire(params, undefined, h.deps);
    assert.equal(
      result.content[0]?.text,
      'User has answered your questions: "Which DB?"="SQLite". "Which extras?"="Cache, Search". You can now continue with the user\'s answers in mind.',
    );
    assert.equal(h.sent.length, 2);
    // two toggle re-renders for question 2, plus one closing edit per question
    assert.equal(h.edits.length, 4);
    assert.match(h.edits[1]?.text ?? "", /✅ 1\. <b>Cache<\/b>/);
    assert.deepEqual(h.edits.at(-1)?.replyMarkup, { inline_keyboard: [] });
    assert.deepEqual(h.mailbox.listPending(), []);
  });

  it("uses a typed reply as a custom answer", async () => {
    const h = harness([[{ type: "text", text: "MySQL" }], [{ type: "text", text: "none" }]]);
    const result = await runTelegramQuestionnaire(params, undefined, h.deps);
    assert.match(result.content[0]?.text ?? "", /"Which DB\?"="MySQL"/);
    assert.match(result.content[0]?.text ?? "", /"Which extras\?"="none"/);
  });

  it("declines on skip and keeps earlier answers in details", async () => {
    const h = harness([[{ type: "pick", option: 0 }], [{ type: "skip" }]]);
    const result = await runTelegramQuestionnaire(params, undefined, h.deps);
    assert.equal(result.content[0]?.text, "User declined to answer questions");
    assert.equal(result.details.cancelled, true);
    assert.equal(result.details.answers[0]?.answer, "Postgres");
    assert.match(h.edits.at(-1)?.text ?? "", /Skipped/);
  });

  it("times out without hanging and says so", async () => {
    const h = harness([], { timeoutMs: 300 });
    const result = await runTelegramQuestionnaire(params, undefined, h.deps);
    assert.match(result.content[0]?.text ?? "", /did not answer the Telegram question/);
    assert.match(h.edits.at(-1)?.text ?? "", /No answer in time/);
    assert.deepEqual(h.mailbox.listPending(), []);
  });

  it("stops on abort and marks the message cancelled", async () => {
    const controller = new AbortController();
    const h = harness([], {
      async sleep() {
        controller.abort();
      },
    });
    const result = await runTelegramQuestionnaire(params, controller.signal, h.deps);
    assert.equal(result.details.cancelled, true);
    assert.match(h.edits.at(-1)?.text ?? "", /Cancelled/);
    assert.deepEqual(h.mailbox.listPending(), []);
  });

  it("reports a send failure so the model can fall back to a plain reply", async () => {
    const h = harness([], {
      async sendView() {
        return { ok: false, reason: "target-unavailable", message: "no active turn" };
      },
    });
    const result = await runTelegramQuestionnaire(params, undefined, h.deps);
    assert.match(result.content[0]?.text ?? "", /^Could not send the question to Telegram \(target-unavailable/);
    assert.equal(result.details.error, "telegram_unavailable");
  });

  it("treats a throwing send like a failed send", async () => {
    const h = harness([], {
      async sendView() {
        throw new Error("socket hang up");
      },
    });
    const result = await runTelegramQuestionnaire(params, undefined, h.deps);
    assert.match(result.content[0]?.text ?? "", /send-threw: Error: socket hang up/);
  });
});
