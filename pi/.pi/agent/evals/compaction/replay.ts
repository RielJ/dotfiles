import type { AgentMessage } from "@earendil-works/pi-agent-core";
import {
  estimateTokens,
  SessionManager,
} from "@earendil-works/pi-coding-agent";

import { prepareCompaction } from "./pi-internals.ts";
import { messageText, type ReplayEntry } from "./session.ts";
import type { Variant } from "./variants.ts";

export interface Profile {
  name: string;
  window: number;
  reserveTokens: number;
  keepRecentTokens: number;
}

export const PROFILES: Record<string, Profile> = {
  real: {
    name: "real",
    window: 200_000,
    reserveTokens: 20_000,
    keepRecentTokens: 30_000,
  },
  stress: {
    name: "stress",
    window: 48_000,
    reserveTokens: 16_384,
    keepRecentTokens: 20_000,
  },
};

export interface CompactionStat {
  /** Index of the replayed entry the compaction ran before. */
  atEntry: number;
  tokensBefore: number;
  tokensAfter: number;
  summaryChars: number;
}

export interface ReplayResult {
  compactions: CompactionStat[];
  /** Assistant requests replayed. */
  requests: number;
  /** Sum of estimated context tokens over every request: what was sent, before caching. */
  sentTokens: number;
  peakTokens: number;
  finalTokens: number;
  /** Text of the latest compaction summary in the final context ("" if none). */
  summaryText: string;
  /** Text of every other message in the final context. */
  keptText: string;
}

function contextTokens(messages: AgentMessage[]): number {
  let total = 0;
  for (const m of messages) total += estimateTokens(m);
  return total;
}

function modelContext(sm: SessionManager, variant: Variant): AgentMessage[] {
  const messages = sm.buildSessionContext().messages;
  return variant.transformContext
    ? variant.transformContext(messages, sm.getBranch())
    : messages;
}

function append(sm: SessionManager, entry: ReplayEntry): void {
  if (entry.kind === "custom_message") {
    sm.appendCustomMessageEntry(entry.customType, entry.content, false);
    return;
  }
  const m = entry.message;
  // Summaries are not messages in a session file; skip any that slipped through.
  if (m.role === "compactionSummary" || m.role === "branchSummary") return;
  sm.appendMessage(m);
}

/**
 * Replay entries through Pi's compaction with one method. Before each assistant
 * message the context is estimated; above `window - reserveTokens` the method
 * compacts, as Pi does before each request.
 */
export async function replay(
  entries: ReplayEntry[],
  variant: Variant,
  profile: Profile,
  probeAt = "end",
): Promise<ReplayResult> {
  const sm = SessionManager.inMemory("/tmp/compaction-eval");
  const settings = {
    enabled: true,
    reserveTokens: profile.reserveTokens,
    keepRecentTokens: profile.keepRecentTokens,
  };
  const threshold = profile.window - profile.reserveTokens;
  const result: ReplayResult = {
    compactions: [],
    requests: 0,
    sentTokens: 0,
    peakTokens: 0,
    finalTokens: 0,
    summaryText: "",
    keptText: "",
  };

  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i];
    if (entry.id === probeAt) break;
    if (entry.kind === "message" && entry.message.role === "assistant") {
      let tokens = contextTokens(modelContext(sm, variant));
      if (variant.compact && tokens > threshold) {
        const branchEntries = sm.getBranch();
        const preparation = prepareCompaction(branchEntries, settings);
        if (preparation) {
          const out = await variant.compact({
            preparation,
            branchEntries,
            sessionManager: sm,
          });
          sm.appendCompaction(
            out.summary,
            out.firstKeptEntryId,
            out.tokensBefore,
            out.details,
            true,
          );
          const after = contextTokens(modelContext(sm, variant));
          result.compactions.push({
            atEntry: i,
            tokensBefore: tokens,
            tokensAfter: after,
            summaryChars: out.summary.length,
          });
          tokens = after;
        }
      }
      result.requests++;
      result.sentTokens += tokens;
      result.peakTokens = Math.max(result.peakTokens, tokens);
    }
    append(sm, entry);
  }

  const final = modelContext(sm, variant);
  result.finalTokens = contextTokens(final);
  const kept: string[] = [];
  for (const m of final) {
    if (m.role === "compactionSummary") result.summaryText = m.summary;
    else kept.push(messageText(m));
  }
  result.keptText = kept.join("\n");
  return result;
}
