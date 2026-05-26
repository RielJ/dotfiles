/**
 * QMD — Local Knowledge Base Search for Pi
 *
 * Integrates QMD (Query Markup Documents) as tools + commands.
 * QMD combines BM25 full-text search, vector semantic search,
 * and LLM re-ranking — all running locally.
 *
 * Tools:
 *   qmd_search  — Keyword search (fast, BM25)
 *   qmd_query   — Hybrid search with reranking (best quality)
 *   qmd_get     — Retrieve a specific document by path or docid
 *
 * Commands:
 *   /search <query>       — Quick keyword search
 *   /query <query>        — Hybrid search with reranking
 *   /qmd status           — Show index health and collections
 *   /qmd collections      — List all collections
 *   /qmd add <path>       — Add a collection
 *   /qmd embed            — Generate/update embeddings
 */

import * as os from "node:os";
import type {
  ExtensionAPI,
  ExtensionContext,
} from "@earendil-works/pi-coding-agent";
import { Text } from "@earendil-works/pi-tui";
import { Type } from "@sinclair/typebox";
import { StringEnum } from "@earendil-works/pi-ai";

// ── Module Metadata ─────────────────────────────────────────────────

export const module = {
  id: "qmd",
  name: "QMD Search",
  description:
    "Local knowledge base search — BM25 + vector + reranking via QMD",
  systemPromptWhenEnabled: `### QMD Knowledge Base Search
You have access to QMD, a local search engine for markdown docs, notes, and knowledge bases.

Available tools:
- qmd_search — Fast keyword search (BM25). Use for exact terms, file names, known phrases.
- qmd_query — Hybrid search with reranking (best quality). Use for natural language questions.
- qmd_get — Retrieve a full document by path or docid (#abc123).

Use these to find relevant context from the user's knowledge base when needed.
When the user asks about something that might be in their notes/docs, search first.`,
};

// ── Helpers ─────────────────────────────────────────────────────────

function shortenPath(p: string): string {
  const home = os.homedir();
  return p.startsWith(home) ? `~${p.slice(home.length)}` : p;
}

// ── Extension ───────────────────────────────────────────────────────

export function init(pi: ExtensionAPI, isEnabled: () => boolean) {
  let currentCtx: ExtensionContext | undefined;

  pi.on("session_start", async (_ev, ctx) => {
    currentCtx = ctx;
  });

  // ── qmd_search tool (BM25 keyword search) ──────────────────────

  pi.registerTool({
    name: "qmd_search",
    label: "QMD Search",
    description:
      "Fast keyword search across indexed collections using BM25. Good for exact terms, file names, known phrases.",
    promptSnippet:
      "Fast keyword search (BM25) across local docs and notes",
    parameters: Type.Object({
      query: Type.String({ description: "Search query" }),
      collection: Type.Optional(
        Type.String({
          description: "Limit search to a specific collection",
        }),
      ),
      limit: Type.Optional(
        Type.Number({
          description: "Max results to return (default 10)",
          default: 10,
        }),
      ),
      min_score: Type.Optional(
        Type.Number({
          description:
            "Minimum relevance score 0-1 (default 0.1)",
          default: 0.1,
        }),
      ),
    }),
    async execute(_id, params, signal) {
      const args = ["search", params.query, "--json"];
      if (params.collection) args.push("-c", params.collection);
      if (params.limit) args.push("-n", String(params.limit));
      if (params.min_score)
        args.push("--min-score", String(params.min_score));

      const result = await pi.exec("qmd", args, { signal, timeout: 30000 });

      if (result.code !== 0) {
        throw new Error(
          `qmd search failed: ${result.stderr || result.stdout}`,
        );
      }

      return {
        content: [{ type: "text", text: result.stdout || "(no results)" }],
        details: { query: params.query, collection: params.collection },
      };
    },
    renderCall(args, theme) {
      const query = args.query || "...";
      const coll = args.collection
        ? theme.fg("dim", ` in ${args.collection}`)
        : "";
      return new Text(
        theme.fg("toolTitle", theme.bold("qmd search ")) +
          theme.fg("accent", `"${query}"`) +
          coll,
        0,
        0,
      );
    },
  });

  // ── qmd_query tool (hybrid + reranking) ────────────────────────

  pi.registerTool({
    name: "qmd_query",
    label: "QMD Query",
    description:
      "Hybrid search combining BM25, vector similarity, and LLM reranking. Best quality results but slower. Use for natural language questions.",
    promptSnippet:
      "Hybrid search with reranking (best quality) across local docs and notes",
    parameters: Type.Object({
      query: Type.String({
        description: "Natural language search query",
      }),
      collection: Type.Optional(
        Type.String({
          description: "Limit search to a specific collection",
        }),
      ),
      limit: Type.Optional(
        Type.Number({
          description: "Max results to return (default 10)",
          default: 10,
        }),
      ),
      min_score: Type.Optional(
        Type.Number({
          description:
            "Minimum relevance score 0-1 (default 0.3)",
          default: 0.3,
        }),
      ),
    }),
    async execute(_id, params, signal) {
      const args = ["query", params.query, "--json"];
      if (params.collection) args.push("-c", params.collection);
      if (params.limit) args.push("-n", String(params.limit));
      if (params.min_score)
        args.push("--min-score", String(params.min_score));

      const result = await pi.exec("qmd", args, { signal, timeout: 60000 });

      if (result.code !== 0) {
        throw new Error(
          `qmd query failed: ${result.stderr || result.stdout}`,
        );
      }

      return {
        content: [{ type: "text", text: result.stdout || "(no results)" }],
        details: { query: params.query, collection: params.collection },
      };
    },
    renderCall(args, theme) {
      const query = args.query || "...";
      const coll = args.collection
        ? theme.fg("dim", ` in ${args.collection}`)
        : "";
      return new Text(
        theme.fg("toolTitle", theme.bold("qmd query ")) +
          theme.fg("accent", `"${query}"`) +
          coll,
        0,
        0,
      );
    },
  });

  // ── qmd_get tool (retrieve document) ───────────────────────────

  pi.registerTool({
    name: "qmd_get",
    label: "QMD Get",
    description:
      "Retrieve a specific document by path or docid (e.g. #abc123). Returns full content with context.",
    promptSnippet:
      "Retrieve a document by path or docid from local knowledge base",
    parameters: Type.Object({
      path: Type.String({
        description:
          "Document path (e.g. 'docs/api.md') or docid (e.g. '#abc123')",
      }),
      full: Type.Optional(
        Type.Boolean({
          description: "Return full document body (default true)",
          default: true,
        }),
      ),
    }),
    async execute(_id, params, signal) {
      const args = ["get", params.path];
      if (params.full !== false) args.push("--full");

      const result = await pi.exec("qmd", args, { signal, timeout: 15000 });

      if (result.code !== 0) {
        throw new Error(
          `qmd get failed: ${result.stderr || result.stdout}`,
        );
      }

      return {
        content: [
          { type: "text", text: result.stdout || "(document not found)" },
        ],
        details: { path: params.path },
      };
    },
    renderCall(args, theme) {
      const p = shortenPath(args.path || "...");
      return new Text(
        theme.fg("toolTitle", theme.bold("qmd get ")) +
          theme.fg("accent", p),
        0,
        0,
      );
    },
  });

  // ── /search command ────────────────────────────────────────────

  pi.registerCommand("search", {
    description: "Quick keyword search via QMD: /search <query>",
    handler: async (args, ctx) => {
      if (!args?.trim()) {
        ctx.ui.notify("Usage: /search <query>", "warning");
        return;
      }

      const result = await pi.exec("qmd", [
        "search",
        args.trim(),
        "-n",
        "10",
      ]);

      if (result.code !== 0) {
        ctx.ui.notify(
          `QMD search failed: ${result.stderr || "unknown error"}`,
          "error",
        );
        return;
      }

      if (!result.stdout?.trim()) {
        ctx.ui.notify("No results found", "info");
        return;
      }

      // Send results to the LLM for summarization
      pi.sendUserMessage(
        `I searched my knowledge base for "${args.trim()}". Here are the results:\n\n${result.stdout}\n\nSummarize the relevant findings.`,
        { deliverAs: "followUp" },
      );
    },
  });

  // ── /query command ─────────────────────────────────────────────

  pi.registerCommand("query", {
    description:
      "Hybrid search with reranking via QMD: /query <natural language>",
    handler: async (args, ctx) => {
      if (!args?.trim()) {
        ctx.ui.notify("Usage: /query <question>", "warning");
        return;
      }

      ctx.ui.notify("Searching (hybrid + reranking)...", "info");

      const result = await pi.exec("qmd", [
        "query",
        args.trim(),
        "-n",
        "10",
      ]);

      if (result.code !== 0) {
        ctx.ui.notify(
          `QMD query failed: ${result.stderr || "unknown error"}`,
          "error",
        );
        return;
      }

      if (!result.stdout?.trim()) {
        ctx.ui.notify("No results found", "info");
        return;
      }

      pi.sendUserMessage(
        `I searched my knowledge base for "${args.trim()}" using hybrid search. Here are the results:\n\n${result.stdout}\n\nSummarize the relevant findings and answer my question.`,
        { deliverAs: "followUp" },
      );
    },
  });

  // ── /qmd command (management) ──────────────────────────────────

  pi.registerCommand("qmd", {
    description:
      "QMD management: /qmd status | collections | add <path> | embed",
    handler: async (args, ctx) => {
      const trimmed = (args || "").trim();
      const parts = trimmed.split(/\s+/);
      const subcmd = parts[0] || "status";

      switch (subcmd) {
        case "status": {
          const result = await pi.exec("qmd", ["status"]);
          if (result.code !== 0) {
            ctx.ui.notify(
              `QMD not available: ${result.stderr || "is it installed?"}`,
              "error",
            );
            return;
          }
          ctx.ui.notify(result.stdout, "info");
          break;
        }

        case "collections": {
          const result = await pi.exec("qmd", ["collection", "list"]);
          if (result.code !== 0) {
            ctx.ui.notify(`Failed: ${result.stderr}`, "error");
            return;
          }
          ctx.ui.notify(
            result.stdout || "No collections configured",
            "info",
          );
          break;
        }

        case "add": {
          const collPath = parts.slice(1).join(" ");
          if (!collPath) {
            ctx.ui.notify("Usage: /qmd add <path> [--name <name>]", "warning");
            return;
          }

          // Parse optional --name flag
          const nameIdx = parts.indexOf("--name");
          let addArgs: string[];
          if (nameIdx > 0 && parts[nameIdx + 1]) {
            const name = parts[nameIdx + 1];
            const pathOnly = parts
              .slice(1, nameIdx)
              .concat(parts.slice(nameIdx + 2))
              .join(" ");
            addArgs = ["collection", "add", pathOnly, "--name", name];
          } else {
            addArgs = ["collection", "add", collPath];
          }

          const result = await pi.exec("qmd", addArgs);
          if (result.code !== 0) {
            ctx.ui.notify(`Failed: ${result.stderr}`, "error");
            return;
          }
          ctx.ui.notify(
            result.stdout || `Added collection: ${collPath}`,
            "success",
          );
          break;
        }

        case "embed": {
          ctx.ui.notify(
            "Generating embeddings (this may take a while)...",
            "info",
          );
          const result = await pi.exec("qmd", ["embed"], {
            timeout: 300000,
          });
          if (result.code !== 0) {
            ctx.ui.notify(`Embed failed: ${result.stderr}`, "error");
            return;
          }
          ctx.ui.notify(
            result.stdout || "Embeddings generated",
            "success",
          );
          break;
        }

        default:
          ctx.ui.notify(
            "Usage: /qmd status | collections | add <path> [--name <name>] | embed",
            "warning",
          );
      }
    },
  });
}
