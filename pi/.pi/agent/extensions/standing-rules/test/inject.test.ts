import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { AgentMessage } from "@earendil-works/pi-agent-core";
import type { SessionEntry } from "@earendil-works/pi-coding-agent";
import { CUSTOM_TYPE, standingRules, withStandingRules } from "../inject.ts";

let n = 0;
function user(text: string): SessionEntry {
  n++;
  return {
    type: "message",
    id: `u${n}`,
    parentId: null,
    timestamp: "2026-01-01T00:00:00.000Z",
    message: { role: "user", content: text, timestamp: n },
  };
}

function compaction(firstKeptEntryId: string): SessionEntry {
  n++;
  return {
    type: "compaction",
    id: `c${n}`,
    parentId: null,
    timestamp: "2026-01-01T00:00:00.000Z",
    summary: "summary",
    firstKeptEntryId,
    tokensBefore: 1000,
  };
}

const summaryMsg: AgentMessage = {
  role: "compactionSummary",
  summary: "summary",
  tokensBefore: 1000,
  timestamp: 5,
};
const recent: AgentMessage = {
  role: "user",
  content: "next step please",
  timestamp: 6,
};

describe("standingRules", () => {
  it("returns nothing before the first compaction", () => {
    assert.equal(standingRules([user("Never deploy on Fridays.")]), undefined);
  });

  it("takes rules only from the summarized messages", () => {
    const old = user("Never deploy on Fridays.");
    const kept = user("Always run the linter before pushing.");
    const rules = standingRules([old, kept, compaction(kept.id)]);
    assert.ok(rules);
    assert.match(rules.text, /Never deploy on Fridays\./);
    assert.doesNotMatch(rules.text, /linter/);
  });

  it("uses the latest compaction", () => {
    const a = user("Never deploy on Fridays.");
    const b = user("Always run the linter before pushing.");
    const c = user("ok continue");
    const rules = standingRules([a, compaction(b.id), b, c, compaction(c.id)]);
    assert.ok(rules);
    assert.match(rules.text, /Fridays/);
    assert.match(rules.text, /linter/);
  });

  it("skips the /commit template", () => {
    const t = user(
      "Inspect and commit current changes. Follow these rules strictly: never use --amend.",
    );
    const k = user("ok");
    assert.equal(standingRules([t, k, compaction(k.id)]), undefined);
  });
});

describe("withStandingRules", () => {
  const rules = { text: "RULES", kept: 1, found: 1 };

  it("inserts the rules right after the summary", () => {
    const out = withStandingRules([summaryMsg, recent], rules);
    assert.equal(out.length, 3);
    const injected = out[1];
    assert.equal(injected.role, "custom");
    assert.ok(
      injected.role === "custom" && injected.customType === CUSTOM_TYPE,
    );
    assert.ok(injected.role === "custom" && injected.content === "RULES");
    assert.equal(out[2], recent);
  });

  it("is a no-op without a summary or when already injected", () => {
    const plain = [recent];
    assert.equal(withStandingRules(plain, rules), plain);
    const once = withStandingRules([summaryMsg, recent], rules);
    assert.equal(withStandingRules(once, rules), once);
  });
});
