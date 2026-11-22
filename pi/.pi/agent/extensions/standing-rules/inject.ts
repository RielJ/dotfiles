import type { AgentMessage } from "@earendil-works/pi-agent-core";
import type { SessionEntry } from "@earendil-works/pi-coding-agent";

import { rulesSection } from "./rules.ts";

export const CUSTOM_TYPE = "standing-rules";

/** Cap on the injected rules, in characters. The eval found 4k enough; most sessions use under 3k. */
export const DEFAULT_BUDGET_CHARS = 4000;

const HEADER = [
  "Standing rules the user set earlier in this session, quoted verbatim.",
  "The messages they came from were compacted away, so they are not in the summary above.",
  "They still apply. When two conflict, the later one (lower in the list) wins.",
].join(" ");

export interface StandingRules {
  text: string;
  kept: number;
  found: number;
}

/**
 * Rules from the user messages the latest compaction summarized away. Rules in
 * messages compaction kept are already in context, so they are left out.
 * Undefined when the branch has no compaction or no rules were found.
 */
export function standingRules(
  branch: SessionEntry[],
  budgetChars = DEFAULT_BUDGET_CHARS,
): StandingRules | undefined {
  let at = -1;
  for (let i = branch.length - 1; i >= 0; i--) {
    if (branch[i].type === "compaction") {
      at = i;
      break;
    }
  }
  if (at < 0) return undefined;
  const compaction = branch[at];
  if (compaction.type !== "compaction") return undefined;
  const firstKept = branch.findIndex(
    (e) => e.id === compaction.firstKeptEntryId,
  );
  const summarized = branch.slice(0, firstKept >= 0 ? firstKept : at);
  const section = rulesSection(summarized, budgetChars);
  if (section.kept === 0) return undefined;
  return {
    text: `${HEADER}${section.text}`,
    kept: section.kept,
    found: section.found,
  };
}

/**
 * Insert the rules right after the compaction summary. The text only changes
 * when a new compaction happens, so the prompt cache stays valid between them.
 */
export function withStandingRules(
  messages: AgentMessage[],
  rules: StandingRules,
): AgentMessage[] {
  let at = -1;
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i];
    if (m.role === "custom" && m.customType === CUSTOM_TYPE) return messages;
    if (m.role === "compactionSummary") {
      at = i;
      break;
    }
  }
  if (at < 0) return messages;
  const summary = messages[at];
  const timestamp =
    summary.role === "compactionSummary" ? summary.timestamp : 0;
  const injected: AgentMessage = {
    role: "custom",
    customType: CUSTOM_TYPE,
    content: rules.text,
    display: false,
    timestamp,
  };
  return [...messages.slice(0, at + 1), injected, ...messages.slice(at + 1)];
}
