import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, describe, it } from "node:test";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import * as bridgeModule from "../index.ts";
import type { TelegramApi, TelegramView } from "../telegram.ts";

const {
  appendTelegramQuestionGuidance,
  createTelegramQuestionBridge,
  isTelegramOriginPrompt,
  TELEGRAM_QUESTION_BLOCK_REASON,
  TELEGRAM_QUESTION_FALLBACK_BLOCK_REASON,
  TELEGRAM_QUESTION_TOOL,
  withoutTerminalQuestionTool,
} = bridgeModule;

type Handler = (...args: unknown[]) => unknown;
type Tool = { name: string; execute: (...args: unknown[]) => Promise<{ content: { text: string }[] }> };

const roots: string[] = [];
after(() => {
  for (const root of roots) rmSync(root, { recursive: true, force: true });
});

function fakeApi() {
  const sent: TelegramView[] = [];
  let updateHandler: ((update: unknown) => unknown) | undefined;
  const api: TelegramApi = {
    async sendView(view) {
      sent.push(view);
      return { ok: true, value: { target: { chatId: 100, threadId: 7 }, messageIds: [555], generation: "g" } };
    },
    async editView(handle) {
      return { ok: true, value: handle };
    },
    registerUpdateHandler(handler) {
      updateHandler = handler as typeof updateHandler;
      return () => {
        updateHandler = undefined;
      };
    },
  };
  return { api, sent, update: (u: unknown) => updateHandler?.(u), hasHandler: () => Boolean(updateHandler) };
}

function createHarness(initialTools: string[], options: { apiAvailable?: boolean } = {}) {
  const root = mkdtempSync(join(tmpdir(), "tqb-bridge-"));
  roots.push(root);
  const handlers = new Map<string, Handler>();
  const tools = new Map<string, Tool>();
  const acks: string[] = [];
  let activeTools = [...initialTools];
  const telegram = fakeApi();
  const api = {
    on(event: string, handler: Handler) {
      handlers.set(event, handler);
    },
    registerTool(tool: Tool) {
      tools.set(tool.name, tool);
    },
    getActiveTools: () => [...activeTools],
    setActiveTools(toolNames: string[]) {
      activeTools = [...toolNames];
    },
  } as unknown as ExtensionAPI;

  createTelegramQuestionBridge({
    agentDir: root,
    loadApi: async () => {
      if (options.apiAvailable === false) throw new Error("not installed");
      return telegram.api;
    },
    readProfiles: () => ({ allowedUserIds: new Set([42]), botTokens: ["t"] }),
    answerCallback: async (_tokens, id, text) => {
      acks.push(`${id}:${text}`);
    },
    newQid: () => "qid1",
    pollMs: 5,
  })(api);

  return {
    handler(name: string): Handler {
      const handler = handlers.get(name);
      assert.ok(handler, `missing ${name} handler`);
      return handler;
    },
    tool: () => tools.get(TELEGRAM_QUESTION_TOOL) as Tool,
    activeTools: () => activeTools,
    telegram,
    acks,
  };
}

describe("Telegram prompt detection", () => {
  it("recognizes classic and threaded Telegram context prefixes", () => {
    assert.equal(isTelegramOriginPrompt("[telegram] hello"), true);
    assert.equal(isTelegramOriginPrompt("  [telegram|thread:Wedding|from:Riel] hello"), true);
    assert.equal(isTelegramOriginPrompt("Telegram session connected"), false);
    assert.equal(isTelegramOriginPrompt(undefined), false);
  });
});

describe("tool filtering", () => {
  it("removes only the terminal questionnaire tool", () => {
    assert.deepEqual(withoutTerminalQuestionTool(["read", "ask_user_question", "bash"]), ["read", "bash"]);
  });

  it("preserves string and array system prompt shapes", () => {
    const text = appendTelegramQuestionGuidance("base");
    assert.equal(typeof text, "string");
    assert.match(text as string, /Telegram question handoff/);
    const parts = appendTelegramQuestionGuidance(["base"]);
    assert.deepEqual((parts as string[]).slice(0, 1), ["base"]);
    assert.match((parts as string[])[1] ?? "", /Telegram question handoff/);
  });
});

describe("extension integration", () => {
  it("swaps ask_user_question for the Telegram tool during a Telegram run, then restores", async () => {
    const harness = createHarness(["read", "ask_user_question"]);
    const result = (await harness.handler("before_agent_start")({
      prompt: "[telegram|thread:Wedding] Pick a design",
      systemPrompt: "base",
    })) as { systemPrompt: string };

    assert.deepEqual(harness.activeTools(), ["read", TELEGRAM_QUESTION_TOOL]);
    assert.match(result.systemPrompt, new RegExp(TELEGRAM_QUESTION_TOOL));
    assert.deepEqual(await harness.handler("tool_call")({ toolName: "ask_user_question" }), {
      block: true,
      reason: TELEGRAM_QUESTION_BLOCK_REASON,
    });

    await harness.handler("agent_settled")({});
    assert.deepEqual(harness.activeTools(), ["read", "ask_user_question"]);
    assert.equal(await harness.handler("tool_call")({ toolName: "ask_user_question" }), undefined);
  });

  it("falls back to plain-reply guidance when pi-telegram's API cannot load", async () => {
    const harness = createHarness(["read", "ask_user_question"], { apiAvailable: false });
    const result = (await harness.handler("before_agent_start")({ prompt: "[telegram] hi", systemPrompt: "base" })) as {
      systemPrompt: string;
    };
    assert.deepEqual(harness.activeTools(), ["read"]);
    assert.match(result.systemPrompt, /end with a concise question/);
    assert.deepEqual(await harness.handler("tool_call")({ toolName: "ask_user_question" }), {
      block: true,
      reason: TELEGRAM_QUESTION_FALLBACK_BLOCK_REASON,
    });
  });

  it("leaves local TUI runs and their questionnaire tool unchanged", async () => {
    const harness = createHarness(["read", "ask_user_question"]);
    const result = await harness.handler("before_agent_start")({ prompt: "Pick a design", systemPrompt: "base" });
    assert.equal(result, undefined);
    assert.deepEqual(harness.activeTools(), ["read", "ask_user_question"]);
    const refused = await harness.tool().execute("id", { questions: [] }, undefined);
    assert.match(refused.content[0]?.text ?? "", /only works in Telegram-originated runs/);
  });

  it("answers end-to-end through the registered update handler", async () => {
    const harness = createHarness(["read", "ask_user_question"]);
    await harness.handler("session_start")({});
    assert.ok(harness.telegram.hasHandler());
    await harness.handler("before_agent_start")({ prompt: "[telegram] hi", systemPrompt: "base" });

    const pending = harness.tool().execute(
      "id",
      {
        questions: [
          { question: "Ship it?", header: "Ship", options: [{ label: "Yes", description: "" }, { label: "No", description: "" }] },
        ],
      },
      undefined,
    );
    while (harness.telegram.sent.length === 0) await new Promise((r) => setTimeout(r, 2));

    const tapFrom = (user: number) => ({
      callback_query: { id: `cb${user}`, from: { id: user }, data: "aq1:qid1:o0", message: { message_id: 555, chat: { id: 100 }, message_thread_id: 7 } },
    });
    assert.equal(await harness.telegram.update(tapFrom(9)), "pass");
    assert.equal(await harness.telegram.update({ message: { text: "/stop", from: { id: 42 }, chat: { id: 100 }, message_thread_id: 7 } }), "pass");
    assert.equal(await harness.telegram.update(tapFrom(42)), "consume");

    const result = await pending;
    assert.match(result.content[0]?.text ?? "", /"Ship it\?"="Yes"/);
    assert.deepEqual(harness.acks, ["cb42:Got it"]);

    assert.equal(await harness.telegram.update(tapFrom(42)), "consume");
    assert.deepEqual(harness.acks.at(-1), "cb42:This question is no longer active.");

    await harness.handler("session_shutdown")({});
    assert.equal(harness.telegram.hasHandler(), false);
  });
});
