import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

const OPUS_5_MODEL_PATTERN = /^claude-opus-5(?:$|-)/;
const UNSUPPORTED_INTEGER_KEYS = new Set(["minimum", "maximum"]);

type ModelIdentity = {
  api?: string;
  id?: string;
  provider?: string;
};

type SchemaPatch = {
  changed: boolean;
  value: unknown;
};

export function isAffectedOpusModel(
  model: ModelIdentity | null | undefined,
): boolean {
  return (
    model?.api === "anthropic-messages" &&
    model.provider === "anthropic" &&
    typeof model.id === "string" &&
    OPUS_5_MODEL_PATTERN.test(model.id)
  );
}

function stripIntegerBounds(value: unknown): SchemaPatch {
  if (Array.isArray(value)) {
    let changed = false;
    const next = value.map((item) => {
      const patched = stripIntegerBounds(item);
      changed ||= patched.changed;
      return patched.value;
    });
    return changed ? { changed, value: next } : { changed, value };
  }

  if (typeof value !== "object" || value === null) {
    return { changed: false, value };
  }

  const record = value as Record<string, unknown>;
  const integerSchema = record.type === "integer";
  let changed = false;
  const next: Record<string, unknown> = {};

  for (const [key, child] of Object.entries(record)) {
    if (integerSchema && UNSUPPORTED_INTEGER_KEYS.has(key)) {
      changed = true;
      continue;
    }
    const patched = stripIntegerBounds(child);
    changed ||= patched.changed;
    next[key] = patched.value;
  }

  return changed ? { changed, value: next } : { changed, value };
}

function sanitizeTool(tool: unknown): SchemaPatch {
  if (typeof tool !== "object" || tool === null || Array.isArray(tool)) {
    return { changed: false, value: tool };
  }

  const record = tool as Record<string, unknown>;
  const sampling = record.constrainedSampling;
  if (
    sampling === false ||
    typeof sampling !== "object" ||
    sampling === null ||
    (sampling as Record<string, unknown>).type !== "json_schema"
  ) {
    return { changed: false, value: tool };
  }

  const patched = stripIntegerBounds(record.parameters);
  if (!patched.changed) return { changed: false, value: tool };

  return {
    changed: true,
    value: { ...record, parameters: patched.value },
  };
}

export function sanitizeOpusToolSchemas<T>(messages: T[]): T[] {
  let changed = false;
  const next = messages.map((message) => {
    if (
      typeof message !== "object" ||
      message === null ||
      Array.isArray(message)
    ) {
      return message;
    }

    const record = message as Record<string, unknown>;
    if (record.role !== "system" || !Array.isArray(record.toolsAdded)) {
      return message;
    }

    let toolsChanged = false;
    const toolsAdded = record.toolsAdded.map((tool) => {
      const patched = sanitizeTool(tool);
      toolsChanged ||= patched.changed;
      return patched.value;
    });
    if (!toolsChanged) return message;

    changed = true;
    return { ...record, toolsAdded } as T;
  });

  return changed ? next : messages;
}

type ContextWithSystemHandler = (
  event: { messages: unknown[] },
  ctx: { model?: ModelIdentity },
) => { messages: unknown[] } | undefined;

export default function anthropicToolSchemaCompat(pi: ExtensionAPI): void {
  // context_with_system shipped in Pi 0.87. Local type packages may lag the
  // running Pi binary, so keep this small compatibility cast at registration.
  // SAFETY: Pi 0.87 exposes this event with the handler shape declared here.
  const onContextWithSystem = pi.on as unknown as (
    event: "context_with_system",
    handler: ContextWithSystemHandler,
  ) => () => void;

  onContextWithSystem("context_with_system", (event, ctx) => {
    if (!isAffectedOpusModel(ctx.model)) return;

    const messages = sanitizeOpusToolSchemas(event.messages);
    if (messages === event.messages) return;

    // Provider context loses unsupported hints only. Pi's registered tool schema
    // still performs the original runtime validation before tool execution.
    return { messages };
  });
}
