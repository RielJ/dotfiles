/**
 * Image media-type guard — global pi extension.
 *
 * Problem it fixes:
 *   Anthropic (and other providers) require every base64 image block to carry a
 *   `media_type` / `mimeType`. If any image in the conversation history reaches the
 *   serializer without one, the provider returns a hard 400:
 *     "messages.N.content.M.image.source.base64.media_type: Field required"
 *   Because that block lives in history, EVERY subsequent request replays it and
 *   400s again — the whole session is bricked until the message is manually edited
 *   out of the session JSONL.
 *
 * Fix:
 *   Hook the `context` event (fires right before the LLM call, upstream of the
 *   provider's convertMessages). Walk every message's content and guarantee each
 *   image block has a valid, supported `mimeType`:
 *     1. If mimeType is valid          -> leave it.
 *     2. If missing/blank/non-canonical -> sniff it from the base64 magic bytes.
 *     3. If still unrecoverable         -> replace the image with a text placeholder
 *                                          so the request can never 400.
 *
 *   Also defensively patches Anthropic-shaped blocks ({ source:{ type:"base64",
 *   media_type } }) in case any pre-converted block sneaks through.
 *
 * Debug:
 *   Set PI_IMG_GUARD_DEBUG=1 to append a line to ~/.pi/image-media-type-guard.log
 *   whenever it repairs or drops a block.
 */

import { appendFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

// Anthropic-supported raster image media types.
const SUPPORTED = new Set([
  "image/png",
  "image/jpeg",
  "image/gif",
  "image/webp",
]);

/** Normalize common aliases to canonical media types. */
function canonicalize(mime: string): string {
  const m = mime.trim().toLowerCase();
  if (m === "image/jpg") return "image/jpeg";
  if (m === "image/svg") return "image/svg+xml";
  return m;
}

function isValidMime(mime: unknown): mime is string {
  return typeof mime === "string" && SUPPORTED.has(canonicalize(mime));
}

/**
 * Sniff a media type from the leading base64 characters of the image data.
 * Base64 encodes 3 bytes -> 4 chars, so the file's magic bytes have stable
 * base64 prefixes.
 */
function sniffMime(data: unknown): string | null {
  if (typeof data !== "string" || data.length < 8) return null;
  const head = data.slice(0, 16);
  if (head.startsWith("iVBORw0KGgo")) return "image/png"; // 89 50 4E 47 0D 0A 1A 0A
  if (head.startsWith("/9j/")) return "image/jpeg"; // FF D8 FF
  if (head.startsWith("R0lGOD")) return "image/gif"; // "GIF8"
  if (head.startsWith("UklGR")) return "image/webp"; // "RIFF" (container; assume WEBP)
  return null;
}

const LOG_PATH = join(homedir(), ".pi", "image-media-type-guard.log");
const DEBUG = process.env.PI_IMG_GUARD_DEBUG === "1";
function log(line: string): void {
  if (!DEBUG) return;
  try {
    appendFileSync(LOG_PATH, `${new Date().toISOString()} ${line}\n`);
  } catch {}
}

interface ImageSource {
  type?: string;
  media_type?: unknown;
  mediaType?: unknown;
  data?: unknown;
  [k: string]: unknown;
}
interface Block {
  type?: string;
  mimeType?: unknown;
  data?: unknown;
  text?: string;
  source?: ImageSource;
  content?: Block[];
  [k: string]: unknown;
}
interface Msg {
  role?: string;
  content?: Block[];
  [k: string]: unknown;
}
interface Wrapper {
  message?: Msg;
  content?: Block[];
  [k: string]: unknown;
}
interface ContextEvent {
  messages?: Wrapper[];
  [k: string]: unknown;
}
type ContextResult = { messages: Wrapper[] } | undefined;
// The runtime exposes a "context" event (used by condensed-milk etc.), but the
// installed @earendil-works type union does not list it. Cast through a minimal
// typed surface so this stays type-checked without `any`.
interface ContextCapableApi {
  on(
    event: "context",
    handler: (event: ContextEvent) => Promise<ContextResult> | ContextResult,
  ): void;
}

/** Return the first candidate that is a valid, supported media type (canonicalized). */
function pickMime(...candidates: unknown[]): string | null {
  for (const c of candidates) {
    if (typeof c === "string" && c.trim().length > 0) {
      const canon = canonicalize(c);
      if (SUPPORTED.has(canon)) return canon;
    }
  }
  return null;
}

/**
 * Normalize any image block to the flat pi-internal shape the serializer reads:
 *   { type:"image", data, mimeType }
 *
 * Handles three real-world shapes seen in session history:
 *   1. flat valid:   { type:"image", data, mimeType:"image/png" }            -> kept
 *   2. nested source: { type:"image", source:{ type:"base64", mediaType|media_type, data } }
 *                     (older pi versions / camelCase) -> flattened
 *   3. missing/blank media type -> sniffed from the base64 magic bytes
 *
 * Unrecoverable blocks (no data, no derivable media type) become a text
 * placeholder so the request can never 400.
 */
function guardBlock(block: Block): Block {
  if (!block || typeof block !== "object" || block.type !== "image")
    return block;

  const src =
    block.source && typeof block.source === "object" ? block.source : undefined;

  // Pull base64 data from the flat field or a nested source.
  const data =
    typeof block.data === "string"
      ? block.data
      : typeof src?.data === "string"
        ? src.data
        : undefined;

  // Media type: first valid of flat mimeType / source.mediaType / source.media_type,
  // else sniff from the data magic bytes.
  const mime =
    pickMime(block.mimeType, src?.mediaType, src?.media_type) ??
    sniffMime(data);

  if (!data || !mime) {
    log("dropped image (no recoverable data/media type)");
    return { type: "text", text: "(image omitted: unrecoverable media type)" };
  }

  // Already a clean flat block — leave it untouched to avoid needless churn.
  if (
    !src &&
    typeof block.data === "string" &&
    isValidMime(block.mimeType) &&
    canonicalize(block.mimeType) === block.mimeType
  ) {
    return block;
  }

  log(`normalized image -> mimeType=${mime}`);
  return { type: "image", data, mimeType: mime };
}

export default function imageMediaTypeGuard(pi: ExtensionAPI) {
  (pi as unknown as ContextCapableApi).on(
    "context",
    async (event: ContextEvent) => {
      const messages = event?.messages;
      if (!Array.isArray(messages)) return undefined;

      let repaired = 0;
      for (const wrapper of messages) {
        // Some pipelines wrap the message as { message: {...} }; handle both.
        const msg = wrapper?.message ?? wrapper;
        const content = msg?.content;
        if (!Array.isArray(content)) continue;

        for (let i = 0; i < content.length; i++) {
          const block = content[i];
          // Top-level image blocks.
          if (block?.type === "image") {
            const fixed = guardBlock(block);
            if (fixed !== block) {
              content[i] = fixed;
              repaired++;
            }
            continue;
          }
          // tool_result blocks carry their own nested content array of [text, image].
          if (block?.type === "tool_result" && Array.isArray(block.content)) {
            for (let j = 0; j < block.content.length; j++) {
              const inner = block.content[j];
              if (inner?.type === "image") {
                const fixed = guardBlock(inner);
                if (fixed !== inner) {
                  block.content[j] = fixed;
                  repaired++;
                }
              }
            }
          }
        }
      }

      if (repaired > 0) log(`turn repaired ${repaired} image block(s)`);
      // Return the (mutated) array so downstream serialization sees the fixes.
      return { messages };
    },
  );
}
