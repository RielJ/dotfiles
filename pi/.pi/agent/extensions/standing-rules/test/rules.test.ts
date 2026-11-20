import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { SessionEntry } from "@earendil-works/pi-coding-agent";
import { extractRules, rulesSection } from "../rules.ts";

function user(id: string, text: string): SessionEntry {
  return {
    type: "message",
    id,
    parentId: null,
    timestamp: "2026-01-01T00:00:00.000Z",
    message: { role: "user", content: text, timestamp: 0 },
  };
}

describe("extractRules", () => {
  it("keeps a rule sentence and attaches its qualifier", () => {
    assert.deepEqual(
      extractRules(
        "Looks good. From now on, run lint before tests. Unless the change is docs only.",
      ),
      ["From now on, run lint before tests. Unless the change is docs only."],
    );
  });

  it("drops questions, plain requests and pasted code", () => {
    assert.deepEqual(
      extractRules(
        'Should we never cache this?\nFix the login bug.\n{\n  "noCache": true,\n}\n  const x = never();',
      ),
      [],
    );
  });

  it("skips injected skill text", () => {
    assert.deepEqual(extractRules("<skill name=x>Always do Y.</skill>"), []);
  });

  it("treats curly and straight apostrophes the same", () => {
    assert.deepEqual(extractRules("Don\u2019t touch the lockfile."), [
      "Don\u2019t touch the lockfile.",
    ]);
    assert.deepEqual(extractRules("Let\u2019s go with the queue approach."), [
      "Let\u2019s go with the queue approach.",
    ]);
  });

  it("keeps casual decisions and constraints", () => {
    for (const s of [
      "go with option B",
      "no tables, only bullet lists in the report",
      "use pnpm for every package script",
      "the footer should stay pinned to the bottom",
      "we'd want the sidebar collapsed by default",
      "not the whole solution in one reply",
      "pls commit by file",
    ])
      assert.deepEqual(extractRules(s), [s], s);
  });

  it("keeps questions that propose a standing rule", () => {
    for (const s of [
      "Can we only run the slow tests on main?",
      "can you make sure every page has a skip link?",
      "I think we'd want dark mode on, but maybe softer colors?",
    ])
      assert.deepEqual(extractRules(s), [s], s);
  });

  it("drops information questions and chat", () => {
    for (const s of [
      "So must I write the parser myself?",
      "How can we make sure the cache only grows?",
      "Do you think we need a queue here?",
      "Can you help me with the setup we need?",
      "I don't know why the build is slow.",
      "I don't think it's needed",
      "It worked yesterday but i don't",
      "The only issue is the slow start.",
      "it should've picked up the new config",
      "Please stop it and run the command again.",
      "instead of",
    ])
      assert.deepEqual(extractRules(s), [], s);
  });

  it("drops log lines", () => {
    assert.deepEqual(
      extractRules(
        "Warning: packages must declare peers\nError: never resolved",
      ),
      [],
    );
  });

  it("trims a long rule around its trigger instead of dropping it", () => {
    const filler = "we went through the whole layout together ".repeat(10);
    const [rule, ...rest] = extractRules(
      `${filler}and from now on keep every card the same height ${filler}`,
    );
    assert.equal(rest.length, 0);
    assert.ok(rule.length <= 302, `length ${rule.length}`);
    assert.match(rule, /^….*from now on keep every card the same height.*…$/);
  });

  it("reads only the lead-in and closing of a pasted document", () => {
    const pasted = Array.from(
      { length: 12 },
      (_, i) => `Candidates must complete section ${i} without outside help.`,
    ).join("\n\n");
    assert.deepEqual(
      extractRules(
        `Help me answer this email, use a friendly tone.\n\n${pasted}\n\nKeep it short.`,
      ),
      ["Help me answer this email, use a friendly tone.", "Keep it short."],
    );
  });
});

describe("rulesSection", () => {
  it("dedupes and keeps the newest rules within budget", () => {
    const entries = [
      user("a", "Always use tabs."),
      user("b", "Always use tabs."),
      user("c", "Never push on Fridays."),
    ];
    const big = rulesSection(entries, 1000);
    assert.equal(big.found, 2);
    assert.equal(big.kept, 2);
    const small = rulesSection(entries, 30);
    assert.equal(small.kept, 1);
    assert.match(small.text, /Never push on Fridays\./);
    assert.doesNotMatch(small.text, /tabs/);
  });
});
