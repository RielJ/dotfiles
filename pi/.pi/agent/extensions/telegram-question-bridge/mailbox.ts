/**
 * Cross-process mailbox for Telegram questions.
 *
 * pi-telegram runs raw-update handlers only in the process that owns
 * `getUpdates` (the leader). In Threaded Mode the instance asking a question
 * may be a follower, so taps and replies are relayed through files:
 *
 *   <root>/pending/<qid>.json        question awaiting an answer (owner writes)
 *   <root>/events/<qid>/<seq>.json   answer events (whichever process sees the update writes)
 *
 * The owner polls its events directory and removes both on completion.
 */

import { mkdirSync, readdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { type AnswerEvent, isOwnCallbackData, parseCallbackData } from "./questionnaire.ts";

export interface PendingQuestion {
  qid: string;
  pid: number;
  chatId: number;
  threadId?: number;
  messageIds: number[];
  createdAt: number;
  expiresAt: number;
}

export type UpdateRoute =
  | { kind: "pass" }
  | { kind: "event"; qid: string; event: AnswerEvent; callbackQueryId?: string }
  | { kind: "stale-callback"; callbackQueryId?: string };

export function isProcessAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === "EPERM";
  }
}

let eventSequence = 0;

export function createMailbox(root: string, isAlive: (pid: number) => boolean = isProcessAlive) {
  const pendingDir = join(root, "pending");
  const eventsRoot = join(root, "events");
  const eventsDir = (qid: string) => join(eventsRoot, qid);

  function writeAtomic(path: string, value: unknown): void {
    const tmp = `${path}.${process.pid}.tmp`;
    writeFileSync(tmp, JSON.stringify(value));
    renameSync(tmp, path);
  }

  function readJson<T>(path: string): T | undefined {
    try {
      return JSON.parse(readFileSync(path, "utf8")) as T;
    } catch {
      return undefined;
    }
  }

  function retract(qid: string): void {
    rmSync(join(pendingDir, `${qid}.json`), { force: true });
    rmSync(eventsDir(qid), { recursive: true, force: true });
  }

  return {
    publish(question: PendingQuestion): void {
      mkdirSync(pendingDir, { recursive: true });
      mkdirSync(eventsDir(question.qid), { recursive: true });
      writeAtomic(join(pendingDir, `${question.qid}.json`), question);
    },

    retract,

    /** Live pending questions; drops expired ones and ones whose owner died. */
    listPending(now = Date.now()): PendingQuestion[] {
      let names: string[];
      try {
        names = readdirSync(pendingDir).filter((n) => n.endsWith(".json"));
      } catch {
        return [];
      }
      const live: PendingQuestion[] = [];
      for (const name of names) {
        const question = readJson<PendingQuestion>(join(pendingDir, name));
        if (!question) continue;
        if (question.expiresAt < now || !isAlive(question.pid)) {
          retract(question.qid);
          continue;
        }
        live.push(question);
      }
      return live;
    },

    postEvent(qid: string, event: AnswerEvent): void {
      const dir = eventsDir(qid);
      mkdirSync(dir, { recursive: true });
      const seq = `${String(Date.now()).padStart(15, "0")}-${process.pid}-${String(++eventSequence).padStart(6, "0")}`;
      writeAtomic(join(dir, `${seq}.json`), event);
    },

    /** Read and delete queued events in arrival order. */
    drainEvents(qid: string): AnswerEvent[] {
      const dir = eventsDir(qid);
      let names: string[];
      try {
        names = readdirSync(dir)
          .filter((n) => n.endsWith(".json"))
          .sort();
      } catch {
        return [];
      }
      const events: AnswerEvent[] = [];
      for (const name of names) {
        const path = join(dir, name);
        const event = readJson<AnswerEvent>(path);
        rmSync(path, { force: true });
        if (event) events.push(event);
      }
      return events;
    },
  };
}

export type Mailbox = ReturnType<typeof createMailbox>;

// ---------------------------------------------------------------------------
// Raw update routing
// ---------------------------------------------------------------------------

interface RawMessage {
  message_id?: number;
  message_thread_id?: number;
  chat?: { id?: number };
  from?: { id?: number };
  text?: string;
}

interface RawUpdate {
  message?: RawMessage;
  callback_query?: { id?: string; from?: { id?: number }; data?: string; message?: RawMessage };
}

function matchesTarget(question: PendingQuestion, message: RawMessage | undefined): boolean {
  if (!message || message.chat?.id !== question.chatId) return false;
  return question.threadId === undefined || message.message_thread_id === question.threadId;
}

/**
 * Decide whether a raw Telegram update answers one of the pending questions.
 *
 * pi-telegram calls update handlers before its own authorization, so only
 * updates from an allowed user are ever claimed. Commands ("/stop") always pass
 * through so the user can still control the run while a question is open.
 */
export function routeUpdate(update: unknown, pending: readonly PendingQuestion[], allowedUserIds: ReadonlySet<number>): UpdateRoute {
  if (!update || typeof update !== "object") return { kind: "pass" };
  const { message, callback_query: query } = update as RawUpdate;

  if (query) {
    if (!isOwnCallbackData(query.data)) return { kind: "pass" };
    if (typeof query.from?.id !== "number" || !allowedUserIds.has(query.from.id)) return { kind: "pass" };
    const parsed = parseCallbackData(query.data);
    const question = parsed && pending.find((p) => p.qid === parsed.qid);
    if (
      !parsed ||
      !question ||
      !matchesTarget(question, query.message) ||
      !question.messageIds.includes(query.message?.message_id ?? -1)
    ) {
      return { kind: "stale-callback", callbackQueryId: query.id };
    }
    return { kind: "event", qid: parsed.qid, event: parsed.event, callbackQueryId: query.id };
  }

  if (message) {
    if (typeof message.from?.id !== "number" || !allowedUserIds.has(message.from.id)) return { kind: "pass" };
    const text = typeof message.text === "string" ? message.text.trim() : "";
    if (!text || text.startsWith("/")) return { kind: "pass" };
    const candidates = pending.filter((p) => matchesTarget(p, message)).sort((a, b) => b.createdAt - a.createdAt);
    const question = candidates[0];
    if (!question) return { kind: "pass" };
    return { kind: "event", qid: question.qid, event: { type: "text", text } };
  }

  return { kind: "pass" };
}
