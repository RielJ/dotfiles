import { readFileSync } from "node:fs";
import type { AgentMessage } from "@earendil-works/pi-agent-core";
import {
  parseSessionEntries,
  type SessionEntry,
} from "@earendil-works/pi-coding-agent";

/** One entry the replay re-appends: a message, or a custom message that reaches the model. */
export type ReplayEntry =
  | { kind: "message"; id: string; message: AgentMessage }
  | {
      kind: "custom_message";
      id: string;
      customType: string;
      content: Extract<SessionEntry, { type: "custom_message" }>["content"];
    };

function isSessionEntry(entry: unknown): entry is SessionEntry {
  return (
    typeof entry === "object" &&
    entry !== null &&
    "id" in entry &&
    "parentId" in entry &&
    "type" in entry
  );
}

/** Entries on the path from the last entry back to the root, in session order. */
export function activeBranch(entries: SessionEntry[]): SessionEntry[] {
  const byId = new Map(entries.map((e) => [e.id, e]));
  const path: SessionEntry[] = [];
  let cursor: SessionEntry | undefined = entries.at(-1);
  const seen = new Set<string>();
  while (cursor && !seen.has(cursor.id)) {
    seen.add(cursor.id);
    path.push(cursor);
    cursor = cursor.parentId ? byId.get(cursor.parentId) : undefined;
  }
  return path.reverse();
}

/**
 * Load a session file and return the entries that carry conversation, with the
 * session's own compaction entries dropped so every method replays the same raw history.
 */
export function loadReplayEntries(file: string): ReplayEntry[] {
  const raw = readFileSync(file, "utf8");
  const entries = parseSessionEntries(raw).filter(isSessionEntry);
  if (entries.length === 0) throw new Error(`no session entries in ${file}`);
  const out: ReplayEntry[] = [];
  for (const entry of activeBranch(entries)) {
    if (entry.type === "message")
      out.push({ kind: "message", id: entry.id, message: entry.message });
    else if (entry.type === "custom_message")
      out.push({
        kind: "custom_message",
        id: entry.id,
        customType: entry.customType,
        content: entry.content,
      });
  }
  return out;
}

function blocksText(content: unknown): string {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  const parts: string[] = [];
  for (const block of content) {
    if (typeof block !== "object" || block === null) continue;
    if (
      "type" in block &&
      block.type === "text" &&
      "text" in block &&
      typeof block.text === "string"
    )
      parts.push(block.text);
    else if ("type" in block && block.type === "toolCall" && "name" in block)
      parts.push(
        `${String(block.name)} ${"arguments" in block ? JSON.stringify(block.arguments) : ""}`,
      );
  }
  return parts.join("\n");
}

/** Text of one message as the model would read it. Thinking blocks are left out. */
export function messageText(message: AgentMessage): string {
  switch (message.role) {
    case "user":
    case "assistant":
    case "toolResult":
    case "custom":
      return blocksText(message.content);
    case "bashExecution":
      return message.excludeFromContext
        ? ""
        : `${message.command}\n${message.output}`;
    case "compactionSummary":
    case "branchSummary":
      return message.summary;
    default:
      return "";
  }
}

/** Text of a replay entry, used to check that each commitment key occurs once in the source. */
export function entryText(entry: ReplayEntry): string {
  return entry.kind === "message"
    ? messageText(entry.message)
    : blocksText(entry.content);
}
