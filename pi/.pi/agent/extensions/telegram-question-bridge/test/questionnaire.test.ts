import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  applyEvent,
  buildQuestionnaireResponse,
  callbackData,
  parseCallbackData,
  type QuestionData,
  renderClosedView,
  renderQuestionView,
  validateQuestionnaire,
} from "../questionnaire.ts";

const single: QuestionData = {
  question: "Which DB?",
  header: "DB",
  options: [
    { label: "Postgres", description: "relational", preview: "CREATE TABLE <t>" },
    { label: "SQLite", description: "embedded" },
  ],
};
const multi: QuestionData = { ...single, question: "Which features?", header: "Features", multiSelect: true };

describe("callback data", () => {
  it("round-trips every event and stays under Telegram's 64-byte limit", () => {
    for (const event of [{ type: "pick", option: 3 }, { type: "done" }, { type: "skip" }] as const) {
      const data = callbackData("Ab_9-xYz", event);
      assert.ok(Buffer.byteLength(data) <= 64);
      assert.deepEqual(parseCallbackData(data), { qid: "Ab_9-xYz", event });
    }
  });

  it("rejects foreign and malformed data", () => {
    assert.equal(parseCallbackData("tgbtn:abc"), undefined);
    assert.equal(parseCallbackData("aq1:abc:o12"), undefined);
    assert.equal(parseCallbackData("aq1:a b:d"), undefined);
    assert.equal(parseCallbackData(undefined), undefined);
  });
});

describe("applyEvent", () => {
  it("answers a single-select pick with label and preview", () => {
    assert.deepEqual(applyEvent(single, 0, [], { type: "pick", option: 0 }), {
      status: "answered",
      answer: { questionIndex: 0, question: "Which DB?", kind: "option", answer: "Postgres", preview: "CREATE TABLE <t>" },
    });
  });

  it("toggles multi-select picks and answers on done", () => {
    let step = applyEvent(multi, 1, [], { type: "pick", option: 1 });
    assert.deepEqual(step, { status: "pending", selected: [1] });
    step = applyEvent(multi, 1, [1], { type: "pick", option: 0 });
    assert.deepEqual(step, { status: "pending", selected: [0, 1] });
    step = applyEvent(multi, 1, [0, 1], { type: "pick", option: 1 });
    assert.deepEqual(step, { status: "pending", selected: [0] });
    assert.deepEqual(applyEvent(multi, 1, [0], { type: "done" }), {
      status: "answered",
      answer: { questionIndex: 1, question: "Which features?", kind: "multi", answer: null, selected: ["Postgres"] },
    });
  });

  it("treats text as a custom answer, or as notes on existing multi selections", () => {
    assert.deepEqual(applyEvent(single, 0, [], { type: "text", text: "  MySQL " }), {
      status: "answered",
      answer: { questionIndex: 0, question: "Which DB?", kind: "custom", answer: "MySQL" },
    });
    const step = applyEvent(multi, 0, [1], { type: "text", text: "and caching" });
    assert.equal(step.status, "answered");
    assert.deepEqual(step.status === "answered" && [step.answer.selected, step.answer.notes], [["SQLite"], "and caching"]);
  });

  it("ignores out-of-range picks, blank text, and done on single-select", () => {
    assert.deepEqual(applyEvent(single, 0, [], { type: "pick", option: 7 }), { status: "pending", selected: [] });
    assert.deepEqual(applyEvent(single, 0, [], { type: "text", text: "   " }), { status: "pending", selected: [] });
    assert.deepEqual(applyEvent(single, 0, [], { type: "done" }), { status: "pending", selected: [] });
    assert.deepEqual(applyEvent(single, 0, [], { type: "skip" }), { status: "skipped" });
  });
});

describe("views", () => {
  it("escapes HTML and builds one button row per option plus a footer", () => {
    const view = renderQuestionView("q1", single, 0, 2);
    assert.match(view.text, /\(1\/2\)/);
    assert.match(view.text, /CREATE TABLE &lt;t&gt;/);
    assert.equal(view.replyMarkup.inline_keyboard.length, 3);
    assert.deepEqual(view.replyMarkup.inline_keyboard[2]?.map((b) => b.text), ["✖ Skip"]);
  });

  it("marks multi-select toggles and adds Done", () => {
    const view = renderQuestionView("q1", multi, 0, 1, [1]);
    assert.equal(view.replyMarkup.inline_keyboard[1]?.[0]?.text, "✅ 2. SQLite");
    assert.equal(view.replyMarkup.inline_keyboard[0]?.[0]?.text, "☐ 1. Postgres");
    assert.deepEqual(view.replyMarkup.inline_keyboard[2]?.map((b) => b.text), ["✔ Done", "✖ Skip"]);
  });

  it("closed view clears the keyboard and shows the answer", () => {
    const view = renderClosedView(single, 0, 1, {
      kind: "answered",
      answer: { questionIndex: 0, question: "Which DB?", kind: "option", answer: "A<b>" },
    });
    assert.deepEqual(view.replyMarkup.inline_keyboard, []);
    assert.match(view.text, /A&lt;b&gt;/);
  });
});

describe("envelope", () => {
  it("matches the rpiv answered envelope", () => {
    const result = buildQuestionnaireResponse(
      {
        cancelled: false,
        answers: [
          { questionIndex: 0, question: "Which DB?", kind: "option", answer: "Postgres", preview: "P" },
          { questionIndex: 1, question: "Which features?", kind: "multi", answer: null, selected: ["A", "B"], notes: "n" },
        ],
      },
      { questions: [single, multi] },
    );
    assert.equal(
      result.content[0]?.text,
      'User has answered your questions: "Which DB?"="Postgres". selected preview: P. "Which features?"="A, B". user notes: n. You can now continue with the user\'s answers in mind.',
    );
  });

  it("declines when cancelled, keeping partial answers in details", () => {
    const partial = { questionIndex: 0, question: "Which DB?", kind: "custom" as const, answer: "x" };
    const result = buildQuestionnaireResponse({ cancelled: true, answers: [partial] }, { questions: [single] });
    assert.equal(result.content[0]?.text, "User declined to answer questions");
    assert.deepEqual(result.details.answers, [partial]);
  });
});

describe("validateQuestionnaire", () => {
  it("accepts valid input and rejects reserved or duplicate labels", () => {
    assert.equal(validateQuestionnaire({ questions: [single] }), undefined);
    assert.match(
      validateQuestionnaire({ questions: [{ ...single, options: [{ label: "Other", description: "" }, single.options[1]!] }] }) ?? "",
      /reserved/,
    );
    assert.match(validateQuestionnaire({ questions: [single, single] }) ?? "", /Duplicate question/);
    assert.match(validateQuestionnaire({ questions: [] }) ?? "", /At least one/);
  });
});
