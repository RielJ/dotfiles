import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  SUBAGENT_REPORT_RULES,
  buildSubagentTaskMessage,
} from "../task-prompt.ts";

describe("subagent task prompt", () => {
  it("places skills before the task and report rules after the summary", () => {
    const message = buildSubagentTaskMessage({
      task: "Fix the parser",
      role: "You are a reviewer.",
      modeHint: "Work autonomously.",
      skillBlock: '<skill name="tdd">Write a failing test.</skill>',
      context: "The parser rejects dates.",
      summaryInstruction: "Summarize the turn.",
      inheritsConversationContext: false,
    });

    const order = [
      "You are a reviewer.",
      "Work autonomously.",
      "## Skills selected by orchestrator",
      "Fix the parser",
      "## Curated context from orchestrator",
      "Summarize the turn.",
      SUBAGENT_REPORT_RULES,
    ].map((part) => message.indexOf(part));
    assert.ok(order.every((index) => index >= 0), message);
    assert.deepEqual(order, [...order].sort((a, b) => a - b));
  });

  it("adds report rules to forked tasks without wrapper text", () => {
    const message = buildSubagentTaskMessage({
      task: "Check the result",
      modeHint: "Unused in a fork.",
      summaryInstruction: "Unused in a fork.",
      inheritsConversationContext: true,
    });

    assert.equal(message, `Check the result\n\n${SUBAGENT_REPORT_RULES}`);
  });
});
