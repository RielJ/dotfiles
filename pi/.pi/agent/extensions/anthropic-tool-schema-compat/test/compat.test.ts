import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import anthropicToolSchemaCompat, {
  isAffectedOpusModel,
  sanitizeOpusToolSchemas,
} from "../index.ts";

const boundedStrictTool = {
  name: "agent_browser_code",
  description: "Run browser code",
  parameters: {
    type: "object",
    properties: {
      timeoutMs: {
        type: "integer",
        minimum: 1,
        maximum: 300_000,
      },
      ratio: {
        type: "number",
        minimum: 0,
        maximum: 1,
      },
    },
    required: [],
  },
  constrainedSampling: { type: "json_schema", strict: "prefer" },
};

function systemMessage(tool: unknown = boundedStrictTool) {
  return {
    role: "system",
    content: "",
    toolsAdded: [tool],
    timestamp: 0,
  };
}

describe("affected model detection", () => {
  it("matches Anthropic Opus 5 model variants", () => {
    for (const id of ["claude-opus-5", "claude-opus-5-5"]) {
      assert.equal(
        isAffectedOpusModel({
          api: "anthropic-messages",
          provider: "anthropic",
          id,
        }),
        true,
      );
    }
  });

  it("does not alter other providers or Claude families", () => {
    assert.equal(
      isAffectedOpusModel({
        api: "anthropic-messages",
        provider: "anthropic",
        id: "claude-sonnet-5",
      }),
      false,
    );
    assert.equal(
      isAffectedOpusModel({
        api: "openai-responses",
        provider: "openai",
        id: "claude-opus-5",
      }),
      false,
    );
  });
});

describe("strict schema compatibility", () => {
  it("removes unsupported bounds only from strict integer schemas", () => {
    const input = [systemMessage()];
    const output = sanitizeOpusToolSchemas(input);
    const parameters = output[0].toolsAdded[0] as {
      parameters: {
        properties: {
          ratio: Record<string, unknown>;
          timeoutMs: Record<string, unknown>;
        };
      };
    };

    assert.notEqual(output, input);
    assert.deepEqual(parameters.parameters.properties.timeoutMs, {
      type: "integer",
    });
    assert.deepEqual(parameters.parameters.properties.ratio, {
      type: "number",
      minimum: 0,
      maximum: 1,
    });
    assert.deepEqual(boundedStrictTool.parameters.properties.timeoutMs, {
      type: "integer",
      minimum: 1,
      maximum: 300_000,
    });
  });

  it("preserves schemas for tools without strict JSON sampling", () => {
    const ordinaryTool = {
      ...boundedStrictTool,
      constrainedSampling: false,
    };
    const input = [systemMessage(ordinaryTool)];

    assert.equal(sanitizeOpusToolSchemas(input), input);
  });
});

describe("extension integration", () => {
  it("patches affected provider context and ignores unaffected models", () => {
    type ContextHandler = (
      event: { messages: unknown[] },
      ctx: { model?: unknown },
    ) => unknown;

    let handler: ContextHandler | undefined;
    const api = {
      on(event: string, nextHandler: ContextHandler) {
        if (event === "context_with_system") handler = nextHandler;
      },
    } as unknown as ExtensionAPI;
    anthropicToolSchemaCompat(api);
    assert.ok(handler);

    const messages = [systemMessage()];
    const affected = handler(
      { messages },
      {
        model: {
          api: "anthropic-messages",
          provider: "anthropic",
          id: "claude-opus-5-5",
        },
      },
    ) as { messages: unknown[] };
    assert.notEqual(affected.messages, messages);

    const unaffected = handler(
      { messages },
      {
        model: {
          api: "anthropic-messages",
          provider: "anthropic",
          id: "claude-sonnet-5",
        },
      },
    );
    assert.equal(unaffected, undefined);
  });
});
