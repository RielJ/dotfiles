/**
 * Thin glue to pi-telegram's public API and config.
 *
 * pi-telegram is installed as a Pi package under <agentDir>/npm, which is not
 * on this extension's module resolution path, so it is imported lazily by
 * resolved path. Its delivery runtime and update registry live on globalThis,
 * so a separately loaded module copy still reaches the running bridge.
 */

import { readFileSync, statSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

export interface TelegramTarget {
  chatId: number;
  threadId?: number;
}

export interface TelegramHandle {
  readonly target: TelegramTarget;
  readonly messageIds: readonly number[];
  readonly generation: string;
}

export interface TelegramView {
  text: string;
  parseMode?: "plain" | "html" | "markdown";
  replyMarkup?: unknown;
}

export type TelegramResult<T> = { ok: true; value: T } | { ok: false; reason: string; message: string };

export interface TelegramApi {
  sendView(view: TelegramView): Promise<TelegramResult<TelegramHandle>>;
  editView(handle: TelegramHandle, view: TelegramView): Promise<TelegramResult<TelegramHandle>>;
  registerUpdateHandler(handler: (update: unknown) => Promise<"consume" | "pass"> | "consume" | "pass"): () => void;
}

interface DeliveryModule {
  sendTelegramView(view: TelegramView, options: { scope: { kind: "active-turn" } }): Promise<TelegramResult<TelegramHandle>>;
  editTelegramView(handle: TelegramHandle, view: TelegramView): Promise<TelegramResult<TelegramHandle>>;
}

interface UpdatesModule {
  registerTelegramUpdateHandler(handler: (update: unknown) => unknown): () => void;
}

export async function loadTelegramApi(agentDir: string): Promise<TelegramApi> {
  const require = createRequire(join(agentDir, "npm", "noop.js"));
  const importExport = (subpath: string) => import(pathToFileURL(require.resolve(`@llblab/pi-telegram/${subpath}`)).href);
  const [delivery, updates] = (await Promise.all([importExport("delivery"), importExport("updates")])) as [
    DeliveryModule,
    UpdatesModule,
  ];
  return {
    sendView: (view) => delivery.sendTelegramView(view, { scope: { kind: "active-turn" } }),
    editView: (handle, view) => delivery.editTelegramView(handle, view),
    registerUpdateHandler: (handler) => updates.registerTelegramUpdateHandler(handler),
  };
}

// ---------------------------------------------------------------------------
// Profiles: allowed users (authorization) and bot tokens (callback acks)
// ---------------------------------------------------------------------------

export interface TelegramProfiles {
  allowedUserIds: Set<number>;
  botTokens: string[];
}

const EMPTY_PROFILES: TelegramProfiles = { allowedUserIds: new Set(), botTokens: [] };

export function parseTelegramProfiles(raw: unknown): TelegramProfiles {
  const profiles = (raw as { profiles?: Record<string, unknown> } | null)?.profiles;
  if (!profiles || typeof profiles !== "object") return EMPTY_PROFILES;
  const result: TelegramProfiles = { allowedUserIds: new Set(), botTokens: [] };
  for (const profile of Object.values(profiles)) {
    const p = profile as { allowedUserId?: unknown; botToken?: unknown } | null;
    if (typeof p?.allowedUserId === "number") result.allowedUserIds.add(p.allowedUserId);
    if (typeof p?.botToken === "string" && p.botToken) result.botTokens.push(p.botToken);
  }
  return result;
}

/** Reads <agentDir>/telegram.json, re-parsing only when its mtime changes. Fails closed. */
export function createProfileReader(configPath: string): () => TelegramProfiles {
  let cachedMtime = -1;
  let cached = EMPTY_PROFILES;
  return () => {
    try {
      const mtime = statSync(configPath).mtimeMs;
      if (mtime !== cachedMtime) {
        cached = parseTelegramProfiles(JSON.parse(readFileSync(configPath, "utf8")));
        cachedMtime = mtime;
      }
      return cached;
    } catch {
      return EMPTY_PROFILES;
    }
  };
}

/**
 * Stops the button's loading spinner. pi-telegram keeps answerCallbackQuery
 * private, so call the Bot API directly. Only getUpdates is exclusive per bot;
 * this call does not interfere with polling. Best effort: errors are ignored,
 * and the token never leaves this function.
 */
export async function answerCallbackQuery(botTokens: readonly string[], callbackQueryId: string, text: string): Promise<void> {
  for (const token of botTokens) {
    try {
      const response = await fetch(`https://api.telegram.org/bot${token}/answerCallbackQuery`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ callback_query_id: callbackQueryId, text }),
        signal: AbortSignal.timeout(5000),
      });
      if (response.ok) return;
    } catch {
      // try the next profile's bot
    }
  }
}
