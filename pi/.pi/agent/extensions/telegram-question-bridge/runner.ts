/**
 * Runs one questionnaire over Telegram: sends each question, waits for its
 * answer through the mailbox, edits the message to its final state, and
 * returns the same envelope as the terminal ask_user_question tool.
 */

import type { Mailbox } from "./mailbox.ts";
import {
  applyEvent,
  buildQuestionnaireResponse,
  buildToolResult,
  type ClosedStatus,
  type QuestionAnswer,
  type QuestionParams,
  renderClosedView,
  renderQuestionView,
} from "./questionnaire.ts";
import type { TelegramHandle, TelegramResult, TelegramView } from "./telegram.ts";

export interface RunnerDeps {
  mailbox: Mailbox;
  sendView(view: TelegramView): Promise<TelegramResult<TelegramHandle>>;
  editView(handle: TelegramHandle, view: TelegramView): Promise<TelegramResult<TelegramHandle>>;
  newQid(): string;
  now(): number;
  sleep(ms: number, signal?: AbortSignal): Promise<void>;
  pollMs: number;
  timeoutMs: number;
}

export const SEND_FAILED_PREFIX = "Could not send the question to Telegram";

export function abortableSleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    if (signal?.aborted) return resolve();
    const timer = setTimeout(done, ms);
    function done() {
      clearTimeout(timer);
      signal?.removeEventListener("abort", done);
      resolve();
    }
    signal?.addEventListener("abort", done, { once: true });
  });
}

export async function runTelegramQuestionnaire(params: QuestionParams, signal: AbortSignal | undefined, deps: RunnerDeps) {
  const total = params.questions.length;
  const answers: QuestionAnswer[] = [];
  const minutes = Math.round(deps.timeoutMs / 60000);

  for (const [index, question] of params.questions.entries()) {
    const qid = deps.newQid();
    const sent = await deps
      .sendView(renderQuestionView(qid, question, index, total))
      .catch((error: unknown) => ({ ok: false as const, reason: "send-threw", message: String(error) }));
    if (!sent.ok) {
      return buildToolResult(
        `${SEND_FAILED_PREFIX} (${sent.reason}: ${sent.message}). Ask in a plain reply instead and end the turn.`,
        { answers, cancelled: true, error: "telegram_unavailable" },
      );
    }

    let handle = sent.value;
    const startedAt = deps.now();
    const publish = () =>
      deps.mailbox.publish({
        qid,
        pid: process.pid,
        chatId: handle.target.chatId,
        ...(handle.target.threadId === undefined ? {} : { threadId: handle.target.threadId }),
        messageIds: [...handle.messageIds],
        createdAt: startedAt,
        expiresAt: startedAt + deps.timeoutMs + 60_000,
      });

    let selected: number[] = [];
    let closed: ClosedStatus | undefined;
    try {
      publish();
      while (!closed) {
        if (signal?.aborted) {
          closed = { kind: "cancelled" };
          break;
        }
        for (const event of deps.mailbox.drainEvents(qid)) {
          const step = applyEvent(question, index, selected, event);
          if (step.status === "answered") closed = { kind: "answered", answer: step.answer };
          else if (step.status === "skipped") closed = { kind: "skipped" };
          else if (step.selected.join() !== selected.join()) {
            selected = step.selected;
            const edited = await deps.editView(handle, renderQuestionView(qid, question, index, total, selected));
            if (edited.ok) {
              handle = edited.value;
              publish();
            }
          }
          if (closed) break;
        }
        if (closed) break;
        if (deps.now() - startedAt >= deps.timeoutMs) {
          closed = { kind: "timeout" };
          break;
        }
        await deps.sleep(deps.pollMs, signal);
      }
    } finally {
      deps.mailbox.retract(qid);
    }

    await deps.editView(handle, renderClosedView(question, index, total, closed)).catch(() => undefined);

    if (closed.kind === "answered") {
      answers.push(closed.answer);
      continue;
    }
    const declineText =
      closed.kind === "timeout"
        ? `User did not answer the Telegram question within ${minutes} minutes. Do not assume an answer; ask again in a plain reply if it is still needed.`
        : undefined;
    return buildQuestionnaireResponse({ answers, cancelled: true }, params, declineText);
  }

  return buildQuestionnaireResponse({ answers, cancelled: false }, params);
}
