/**
 * Telegram questionnaire core: views, answer state machine, result envelope.
 *
 * Pure functions only. The result envelope mirrors
 * @juicesharp/rpiv-ask-user-question (tool/response-envelope.ts) so the model
 * reads Telegram answers exactly like terminal answers.
 */

export const MAX_QUESTIONS = 4;
export const MIN_OPTIONS = 2;
export const MAX_OPTIONS = 4;
export const RESERVED_LABELS = ["Other", "Type something.", "Next"];

const CALLBACK_PREFIX = "aq1";
const MAX_PREVIEW_CHARS = 1200;
const MAX_DESCRIPTION_CHARS = 300;

export interface OptionData {
  label: string;
  description: string;
  preview?: string;
}

export interface QuestionData {
  question: string;
  header: string;
  options: OptionData[];
  multiSelect?: boolean;
}

export interface QuestionParams {
  questions: QuestionData[];
}

export interface QuestionAnswer {
  questionIndex: number;
  question: string;
  kind: "option" | "custom" | "multi";
  answer: string | null;
  selected?: string[];
  notes?: string;
  preview?: string;
}

export interface QuestionnaireResult {
  answers: QuestionAnswer[];
  cancelled: boolean;
  error?: string;
}

export type AnswerEvent =
  | { type: "pick"; option: number }
  | { type: "done" }
  | { type: "text"; text: string }
  | { type: "skip" };

export type QuestionStep =
  | { status: "pending"; selected: number[] }
  | { status: "answered"; answer: QuestionAnswer }
  | { status: "skipped" };

export interface InlineButton {
  text: string;
  callback_data: string;
}

export interface QuestionView {
  text: string;
  parseMode: "html";
  replyMarkup: { inline_keyboard: InlineButton[][] };
}

export const DECLINE_MESSAGE = "User declined to answer questions";
const ENVELOPE_PREFIX = "User has answered your questions:";
const ENVELOPE_SUFFIX = "You can now continue with the user's answers in mind.";

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

/** Returns an error message, or undefined when the questionnaire is valid. */
export function validateQuestionnaire(params: QuestionParams): string | undefined {
  const questions = params?.questions;
  if (!Array.isArray(questions) || questions.length === 0) return "At least one question is required.";
  if (questions.length > MAX_QUESTIONS) return `At most ${MAX_QUESTIONS} questions are allowed.`;
  const seenQuestions = new Set<string>();
  for (const q of questions) {
    if (seenQuestions.has(q.question)) return `Duplicate question: "${q.question}".`;
    seenQuestions.add(q.question);
    if (!Array.isArray(q.options) || q.options.length < MIN_OPTIONS || q.options.length > MAX_OPTIONS) {
      return `Question "${q.question}" needs ${MIN_OPTIONS}-${MAX_OPTIONS} options.`;
    }
    const seenLabels = new Set<string>();
    for (const o of q.options) {
      if (RESERVED_LABELS.includes(o.label)) return `Option label "${o.label}" is reserved.`;
      if (seenLabels.has(o.label)) return `Duplicate option label "${o.label}" in "${q.question}".`;
      seenLabels.add(o.label);
    }
  }
  return undefined;
}

// ---------------------------------------------------------------------------
// Callback data: aq1:<qid>:o<n> | aq1:<qid>:d | aq1:<qid>:x  (<= 64 bytes)
// ---------------------------------------------------------------------------

export function callbackData(qid: string, event: AnswerEvent): string {
  switch (event.type) {
    case "pick":
      return `${CALLBACK_PREFIX}:${qid}:o${event.option}`;
    case "done":
      return `${CALLBACK_PREFIX}:${qid}:d`;
    case "skip":
      return `${CALLBACK_PREFIX}:${qid}:x`;
    case "text":
      throw new Error("text answers have no callback data");
  }
}

/** True for any callback in our namespace, valid or not. */
export function isOwnCallbackData(data: unknown): data is string {
  return typeof data === "string" && data.startsWith(`${CALLBACK_PREFIX}:`);
}

export function parseCallbackData(data: unknown): { qid: string; event: AnswerEvent } | undefined {
  if (!isOwnCallbackData(data)) return undefined;
  const match = /^aq1:([A-Za-z0-9_-]{1,32}):(o(\d)|d|x)$/.exec(data);
  if (!match) return undefined;
  const qid = match[1] as string;
  if (match[2] === "d") return { qid, event: { type: "done" } };
  if (match[2] === "x") return { qid, event: { type: "skip" } };
  return { qid, event: { type: "pick", option: Number(match[3]) } };
}

// ---------------------------------------------------------------------------
// State machine
// ---------------------------------------------------------------------------

export function applyEvent(
  question: QuestionData,
  questionIndex: number,
  selected: readonly number[],
  event: AnswerEvent,
): QuestionStep {
  const base = { questionIndex, question: question.question };
  const unchanged: QuestionStep = { status: "pending", selected: [...selected] };

  switch (event.type) {
    case "skip":
      return { status: "skipped" };

    case "pick": {
      const option = question.options[event.option];
      if (!option) return unchanged;
      if (!question.multiSelect) {
        return {
          status: "answered",
          answer: {
            ...base,
            kind: "option",
            answer: option.label,
            ...(option.preview ? { preview: option.preview } : {}),
          },
        };
      }
      const next = selected.includes(event.option)
        ? selected.filter((i) => i !== event.option)
        : [...selected, event.option].sort((a, b) => a - b);
      return { status: "pending", selected: next };
    }

    case "done":
      if (!question.multiSelect) return unchanged;
      return {
        status: "answered",
        answer: { ...base, kind: "multi", answer: null, selected: labelsFor(question, selected) },
      };

    case "text": {
      const text = event.text.trim();
      if (!text) return unchanged;
      if (question.multiSelect && selected.length > 0) {
        return {
          status: "answered",
          answer: { ...base, kind: "multi", answer: null, selected: labelsFor(question, selected), notes: text },
        };
      }
      return { status: "answered", answer: { ...base, kind: "custom", answer: text } };
    }
  }
}

function labelsFor(question: QuestionData, selected: readonly number[]): string[] {
  return selected.map((i) => question.options[i]?.label).filter((l): l is string => typeof l === "string");
}

// ---------------------------------------------------------------------------
// Views
// ---------------------------------------------------------------------------

export function escapeHtml(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function clip(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

function headerLine(question: QuestionData, index: number, total: number): string {
  const counter = total > 1 ? ` (${index + 1}/${total})` : "";
  return `❓ <b>${escapeHtml(question.header)}</b>${counter}\n${escapeHtml(question.question)}`;
}

export function renderQuestionView(
  qid: string,
  question: QuestionData,
  index: number,
  total: number,
  selected: readonly number[] = [],
): QuestionView {
  const lines = [headerLine(question, index, total), ""];
  question.options.forEach((option, i) => {
    const mark = question.multiSelect ? (selected.includes(i) ? "✅ " : "☐ ") : "";
    const description = option.description ? ` — ${escapeHtml(clip(option.description, MAX_DESCRIPTION_CHARS))}` : "";
    lines.push(`${mark}${i + 1}. <b>${escapeHtml(option.label)}</b>${description}`);
    if (option.preview) lines.push(`<pre>${escapeHtml(clip(option.preview, MAX_PREVIEW_CHARS))}</pre>`);
  });
  lines.push(
    "",
    question.multiSelect
      ? "<i>Tap options to toggle them, then Done. Or reply with text to answer in your own words.</i>"
      : "<i>Tap an option, or reply with text to answer in your own words.</i>",
  );

  const rows: InlineButton[][] = question.options.map((option, i) => [
    {
      text: `${question.multiSelect ? (selected.includes(i) ? "✅ " : "☐ ") : ""}${i + 1}. ${option.label}`,
      callback_data: callbackData(qid, { type: "pick", option: i }),
    },
  ]);
  const footer: InlineButton[] = [];
  if (question.multiSelect) footer.push({ text: "✔ Done", callback_data: callbackData(qid, { type: "done" }) });
  footer.push({ text: "✖ Skip", callback_data: callbackData(qid, { type: "skip" }) });
  rows.push(footer);

  return { text: lines.join("\n"), parseMode: "html", replyMarkup: { inline_keyboard: rows } };
}

export type ClosedStatus =
  | { kind: "answered"; answer: QuestionAnswer }
  | { kind: "skipped" }
  | { kind: "cancelled" }
  | { kind: "timeout" };

export function renderClosedView(question: QuestionData, index: number, total: number, status: ClosedStatus): QuestionView {
  let footer: string;
  switch (status.kind) {
    case "answered":
      footer = `✅ <b>${escapeHtml(formatAnswerScalar(status.answer))}</b>`;
      if (status.answer.notes) footer += `\n📝 ${escapeHtml(status.answer.notes)}`;
      break;
    case "skipped":
      footer = "✖ <i>Skipped</i>";
      break;
    case "cancelled":
      footer = "⏹ <i>Cancelled</i>";
      break;
    case "timeout":
      footer = "⌛ <i>No answer in time</i>";
      break;
  }
  return {
    text: `${headerLine(question, index, total)}\n\n${footer}`,
    parseMode: "html",
    replyMarkup: { inline_keyboard: [] },
  };
}

// ---------------------------------------------------------------------------
// Result envelope (mirrors rpiv-ask-user-question)
// ---------------------------------------------------------------------------

export function formatAnswerScalar(a: QuestionAnswer): string {
  switch (a.kind) {
    case "multi":
      return a.selected && a.selected.length > 0 ? a.selected.join(", ") : "(no input)";
    case "custom":
    case "option":
      return a.answer && a.answer.length > 0 ? a.answer : "(no input)";
  }
}

function answerSegment(a: QuestionAnswer): string {
  const parts = [`"${a.question}"="${formatAnswerScalar(a)}"`];
  if (a.preview) parts.push(`selected preview: ${a.preview}`);
  if (a.notes) parts.push(`user notes: ${a.notes}`);
  return `${parts.join(". ")}.`;
}

export function buildToolResult(text: string, details: QuestionnaireResult) {
  return { content: [{ type: "text" as const, text }], details };
}

export function buildQuestionnaireResponse(result: QuestionnaireResult, params: QuestionParams, declineText?: string) {
  if (result.cancelled) {
    return buildToolResult(declineText ?? DECLINE_MESSAGE, { ...result, cancelled: true });
  }
  const segments: string[] = [];
  params.questions.forEach((_, i) => {
    const a = result.answers.find((x) => x.questionIndex === i);
    if (a) segments.push(answerSegment(a));
  });
  if (segments.length === 0) return buildToolResult(DECLINE_MESSAGE, { answers: result.answers, cancelled: true });
  return buildToolResult(`${ENVELOPE_PREFIX} ${segments.join(" ")} ${ENVELOPE_SUFFIX}`, result);
}
