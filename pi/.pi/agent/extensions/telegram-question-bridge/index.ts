import { randomBytes } from "node:crypto";
import { join } from "node:path";
import { type ExtensionAPI, getAgentDir } from "@earendil-works/pi-coding-agent";
import { Type } from "@sinclair/typebox";
import { createMailbox, routeUpdate } from "./mailbox.ts";
import { buildToolResult, type QuestionParams, validateQuestionnaire } from "./questionnaire.ts";
import { abortableSleep, runTelegramQuestionnaire } from "./runner.ts";
import {
  answerCallbackQuery,
  createProfileReader,
  loadTelegramApi,
  type TelegramApi,
  type TelegramProfiles,
} from "./telegram.ts";

const TERMINAL_QUESTION_TOOL = "ask_user_question";
export const TELEGRAM_QUESTION_TOOL = "telegram_ask_user_question";

export const TELEGRAM_QUESTION_GUIDANCE = `

Telegram question handoff: this run came from Telegram, where the terminal \`ask_user_question\` overlay is unavailable. Use \`${TELEGRAM_QUESTION_TOOL}\` instead. It takes the same arguments and returns answers in the same format; it posts each question to this Telegram chat with buttons and waits for the user's tap or typed reply. Skills or instructions that say to use \`ask_user_question\` mean \`${TELEGRAM_QUESTION_TOOL}\` here. If it reports it could not send, ask in a plain reply and end the turn.`;

export const TELEGRAM_QUESTION_FALLBACK_GUIDANCE = `

Telegram question handoff: \`ask_user_question\` is terminal-only and unavailable for this Telegram-originated run. When you need a decision, end with a concise question the user can answer in Telegram. Use \`telegram_button\` controls for one single-choice question at a time, with each button prompt containing the complete answer. For multi-select or free-form input, request a normal text reply. Do not wait on terminal UI.`;

export const TELEGRAM_QUESTION_BLOCK_REASON = `ask_user_question is terminal-only and unavailable for Telegram-originated runs. Call ${TELEGRAM_QUESTION_TOOL} with the same arguments instead.`;

export const TELEGRAM_QUESTION_FALLBACK_BLOCK_REASON =
  "ask_user_question is unavailable for Telegram-originated runs. Ask in your assistant reply instead. Use Telegram prompt buttons for one single-choice question, or request a text reply for multi-select or free-form input, then end the turn.";

const TOOL_EXPOSURE = { exposure: "model-only", defaultActive: false } as const;
const DEFAULT_TIMEOUT_MS = 30 * 60 * 1000;
const DEFAULT_POLL_MS = 400;

type SystemPrompt = string | string[];

export function isTelegramOriginPrompt(prompt: string | null | undefined): boolean {
  return typeof prompt === "string" && /^\[telegram(?:\]|\|)/.test(prompt.trimStart());
}

export function withoutTerminalQuestionTool(toolNames: string[]): string[] {
  return toolNames.filter((name) => name !== TERMINAL_QUESTION_TOOL);
}

export function appendTelegramQuestionGuidance(
  systemPrompt: SystemPrompt | null | undefined,
  guidance: string = TELEGRAM_QUESTION_GUIDANCE,
): SystemPrompt {
  if (Array.isArray(systemPrompt)) return [...systemPrompt, guidance];
  return `${systemPrompt ?? ""}${guidance}`;
}

// Same shape as @juicesharp/rpiv-ask-user-question's QuestionParamsSchema.
const QuestionParamsSchema = Type.Object({
  questions: Type.Array(
    Type.Object({
      question: Type.String({ description: "The complete question to ask the user. Should be clear, specific, and end with a question mark." }),
      header: Type.String({ maxLength: 16, description: "MAX 16 CHARACTERS. Very short chip/tag shown above the question." }),
      options: Type.Array(
        Type.Object({
          label: Type.String({ maxLength: 60, description: "MAX 60 CHARACTERS. Concise display text for this option (1-5 words)." }),
          description: Type.String({ description: "Explanation of what this option means or its trade-offs." }),
          preview: Type.Optional(Type.String({ description: "Optional mockup, code snippet, or config shown in a code block." })),
        }),
        {
          minItems: 2,
          maxItems: 4,
          description: "2-4 distinct choices. The user can always reply with free text, so do NOT author an 'Other' option.",
        },
      ),
      multiSelect: Type.Optional(Type.Boolean({ default: false, description: "Allow selecting multiple options." })),
    }),
    { minItems: 1, maxItems: 4, description: "Questions to ask the user (1-4), asked one after another." },
  ),
});

export interface BridgeDeps {
  agentDir: string;
  loadApi(agentDir: string): Promise<TelegramApi>;
  readProfiles?: () => TelegramProfiles;
  answerCallback(botTokens: readonly string[], callbackQueryId: string, text: string): Promise<void>;
  newQid(): string;
  now(): number;
  pollMs: number;
  timeoutMs: number;
}

const CALLBACK_TOAST = { pick: "Got it", done: "Done", skip: "Skipped", text: "" } as const;

function looksRelevant(update: unknown): boolean {
  if (!update || typeof update !== "object") return false;
  const u = update as { callback_query?: { data?: unknown }; message?: { text?: unknown } };
  if (u.callback_query) return typeof u.callback_query.data === "string" && u.callback_query.data.startsWith("aq1:");
  return typeof u.message?.text === "string";
}

export function createTelegramQuestionBridge(overrides: Partial<BridgeDeps> = {}) {
  return function telegramQuestionBridge(pi: ExtensionAPI): void {
    const deps: BridgeDeps = {
      agentDir: overrides.agentDir ?? getAgentDir(),
      loadApi: loadTelegramApi,
      answerCallback: answerCallbackQuery,
      newQid: () => randomBytes(6).toString("base64url"),
      now: Date.now,
      pollMs: DEFAULT_POLL_MS,
      timeoutMs: DEFAULT_TIMEOUT_MS,
      ...overrides,
    };
    const mailbox = createMailbox(join(deps.agentDir, "tmp", "telegram-question-bridge"));
    const readProfiles = deps.readProfiles ?? createProfileReader(join(deps.agentDir, "telegram.json"));

    let api: TelegramApi | undefined;
    let apiLoad: Promise<TelegramApi | undefined> | undefined;
    let disposeUpdateHandler: (() => void) | undefined;
    let telegramRunActive = false;
    let terminalToolSuspended = false;
    let telegramToolActivated = false;

    function ensureApi(): Promise<TelegramApi | undefined> {
      apiLoad ??= deps.loadApi(deps.agentDir).then(
        (loaded) => {
          api = loaded;
          return loaded;
        },
        () => undefined,
      );
      return apiLoad;
    }

    async function handleUpdate(update: unknown): Promise<"consume" | "pass"> {
      if (!looksRelevant(update)) return "pass";
      const profiles = readProfiles();
      if (profiles.allowedUserIds.size === 0) return "pass";
      const route = routeUpdate(update, mailbox.listPending(deps.now()), profiles.allowedUserIds);
      if (route.kind === "pass") return "pass";
      if (route.kind === "event") mailbox.postEvent(route.qid, route.event);
      if (route.callbackQueryId) {
        const toast = route.kind === "event" ? CALLBACK_TOAST[route.event.type] : "This question is no longer active.";
        void deps.answerCallback(profiles.botTokens, route.callbackQueryId, toast).catch(() => undefined);
      }
      return "consume";
    }

    function restoreTools(): void {
      const active = pi.getActiveTools();
      let next = active;
      if (terminalToolSuspended && !next.includes(TERMINAL_QUESTION_TOOL)) next = [...next, TERMINAL_QUESTION_TOOL];
      if (telegramToolActivated) next = next.filter((name) => name !== TELEGRAM_QUESTION_TOOL);
      if (next !== active) pi.setActiveTools(next);
      terminalToolSuspended = false;
      telegramToolActivated = false;
    }

    pi.registerTool({
      name: TELEGRAM_QUESTION_TOOL,
      label: "Ask User Question (Telegram)",
      description:
        "Ask the user 1-4 structured questions in the current Telegram chat and wait for the answers. Same arguments and answer format as ask_user_question. Each question is sent as a message with one button per option; the user taps an option (toggles for multiSelect, then Done) or replies with text to answer in their own words. Only available in Telegram-originated runs.",
      promptSnippet: "Ask the user structured questions with Telegram buttons and wait for the answers",
      promptGuidelines: [
        `Use ${TELEGRAM_QUESTION_TOOL} instead of ask_user_question during Telegram-originated runs.`,
        "If you recommend an option, make it the first option and add \"(Recommended)\" to its label.",
      ],
      parameters: QuestionParamsSchema,
      // Pi >= 1.0: off until a Telegram run activates it, and never callable from codemode/tool
      // search (interactive tool). Spread because the repo's dev typings (0.84) predate these fields.
      ...(TOOL_EXPOSURE as object),
      async execute(_toolCallId, params, signal) {
        const typed = params as unknown as QuestionParams;
        if (!telegramRunActive) {
          return buildToolResult(
            `${TELEGRAM_QUESTION_TOOL} only works in Telegram-originated runs. Use ask_user_question instead.`,
            { answers: [], cancelled: true, error: "not_telegram_run" },
          );
        }
        const invalid = validateQuestionnaire(typed);
        if (invalid) return buildToolResult(invalid, { answers: [], cancelled: true, error: "invalid_questionnaire" });
        const loaded = await ensureApi();
        if (!loaded) {
          return buildToolResult(
            "Could not send the question to Telegram (pi-telegram API unavailable). Ask in a plain reply instead and end the turn.",
            { answers: [], cancelled: true, error: "telegram_unavailable" },
          );
        }
        return runTelegramQuestionnaire(typed, signal, {
          mailbox,
          sendView: loaded.sendView,
          editView: loaded.editView,
          newQid: deps.newQid,
          now: deps.now,
          sleep: abortableSleep,
          pollMs: deps.pollMs,
          timeoutMs: deps.timeoutMs,
        });
      },
    });

    pi.on("session_start", async () => {
      disposeUpdateHandler?.();
      disposeUpdateHandler = undefined;
      const loaded = await ensureApi();
      if (loaded) disposeUpdateHandler = loaded.registerUpdateHandler(handleUpdate);
    });

    pi.on("session_shutdown", () => {
      disposeUpdateHandler?.();
      disposeUpdateHandler = undefined;
    });

    pi.on("before_agent_start", async (event) => {
      telegramRunActive = isTelegramOriginPrompt(event.prompt);
      if (!telegramRunActive) {
        restoreTools();
        return;
      }

      const available = Boolean(await ensureApi());
      const active = pi.getActiveTools();
      let next = withoutTerminalQuestionTool(active);
      if (next.length !== active.length) terminalToolSuspended = true;
      if (available && !next.includes(TELEGRAM_QUESTION_TOOL)) {
        next = [...next, TELEGRAM_QUESTION_TOOL];
        telegramToolActivated = true;
      }
      if (next.length !== active.length || next.some((name, i) => name !== active[i])) pi.setActiveTools(next);

      return {
        systemPrompt: appendTelegramQuestionGuidance(
          event.systemPrompt as SystemPrompt | null | undefined,
          available ? TELEGRAM_QUESTION_GUIDANCE : TELEGRAM_QUESTION_FALLBACK_GUIDANCE,
        ) as typeof event.systemPrompt,
      };
    });

    pi.on("tool_call", (event) => {
      if (telegramRunActive && event.toolName === TERMINAL_QUESTION_TOOL) {
        return { block: true, reason: api ? TELEGRAM_QUESTION_BLOCK_REASON : TELEGRAM_QUESTION_FALLBACK_BLOCK_REASON };
      }
    });

    pi.on("agent_settled", () => {
      telegramRunActive = false;
      restoreTools();
    });
  };
}

export default createTelegramQuestionBridge();
