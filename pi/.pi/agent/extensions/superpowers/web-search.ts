/**
 * Web Search — search the web and read pages, free, no API keys required.
 *
 *   web_search — DuckDuckGo Lite fetched directly; falls back to Exa's keyless MCP search, then Jina.
 *   web_read   — direct fetch (blocks private and local addresses) converted to markdown locally;
 *                falls back to Exa's web_fetch_exa, then Jina Reader (renders JavaScript, reads PDFs).
 * Optional JINA_API_KEY authenticates Jina. PI_WEB_ALLOW_PRIVATE_NETWORK=1 lets web_read reach
 * localhost and LAN hosts. Backends live in the _web-*.ts and _exa.ts files, free of pi imports.
 *
 * Why not a browser? It's heavy, slow, and its DOM snapshots cost many tokens. Use a browser tool
 * only when a page needs interaction (clicking, forms, login).
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Text } from "@earendil-works/pi-tui";
import { Type } from "@sinclair/typebox";
import { readPage } from "./_web-read-core.js";
import { searchWeb } from "./_web-search-core.js";

// ── Module Metadata ─────────────────────────────────────────────────

export const module = {
	id: "web-search",
	name: "Web Search",
	description: "Search the web and read pages (DuckDuckGo, Exa, Jina; no API keys)",
	systemPromptWhenEnabled: `### Web Search
You have two web tools:
- \`web_search\` — search DuckDuckGo, returns titles + snippets + URLs
- \`web_read\` — fetch any URL and get clean markdown content

Use web_search to find information, then web_read to read specific pages.
These are fast and free (no API keys). Prefer these over bash curl.
web_read refuses localhost and private-network addresses; use bash curl for local servers.`,
};

// ── Helpers ─────────────────────────────────────────────────────────

/** Optional: an authenticated Jina key avoids its anonymous abuse blocks (used by the search fallback and web_read). */
const jinaApiKey = () => process.env.JINA_API_KEY || undefined;

function errorMessage(err: unknown): string {
	return err instanceof Error ? err.message : String(err);
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null;
}

/** Reads a numeric and a string field from a tool result's details, if present. */
function detailFields(details: unknown, numKey: string, strKey: string): { num: number; str: string } | undefined {
	if (!isRecord(details)) return undefined;
	const num = details[numKey];
	const str = details[strKey];
	return typeof num === "number" && typeof str === "string" ? { num, str } : undefined;
}

// ── Extension ───────────────────────────────────────────────────────

export function init(pi: ExtensionAPI, _isEnabled: () => boolean) {

	// ── web_search tool ─────────────────────────────────────────────

	pi.registerTool({
		name: "web_search",
		label: "Web Search",
		description: "Search the web via DuckDuckGo. Returns titles, snippets, and URLs. Use web_read to fetch full page content.",
		parameters: Type.Object({
			query: Type.String({ description: "Search query" }),
			max_results: Type.Optional(Type.Number({ description: "Max results to return (default 5, max 10)" })),
		}),
		async execute(_id, params, signal, _onUpdate, _ctx) {
			const maxResults = Math.min(params.max_results || 5, 10);

			try {
				const outcome = await searchWeb(params.query, { signal, jinaApiKey: jinaApiKey() });
				const results = outcome.results.slice(0, maxResults);
				const fallbackNote = outcome.failures.length > 0 ? `\n\n_(via ${outcome.backend}; ${outcome.failures.join("; ")})_` : "";

				if (results.length === 0) {
					return {
						content: [{ type: "text", text: `No results found for "${params.query}"${fallbackNote}` }],
						details: { query: params.query, resultCount: 0, backend: outcome.backend },
					};
				}

				const formatted = results.map((r, i) =>
					`${i + 1}. **${r.title}**\n   ${r.url}\n   ${r.snippet}`
				).join("\n\n");

				return {
					content: [{ type: "text", text: `## Search: ${params.query}\n\n${formatted}${fallbackNote}` }],
					details: { query: params.query, resultCount: results.length, results, backend: outcome.backend },
				};
			} catch (err) {
				return {
					content: [{ type: "text", text: `Search failed: ${errorMessage(err)}` }],
					details: { query: params.query, resultCount: 0 },
					isError: true,
				};
			}
		},
		renderCall(args, theme) {
			return new Text(theme.fg("toolTitle", theme.bold("web_search ")) + theme.fg("accent", `"${args.query || "?"}" `), 0, 0);
		},
		renderResult(result, _opts, theme) {
			const d = detailFields(result.details, "resultCount", "query");
			if (d && d.num > 0) {
				return new Text(theme.fg("success", `✓ ${d.num} results`) + theme.fg("dim", ` for "${d.str}"`), 0, 0);
			}
			const text = result.content[0]?.type === "text" ? result.content[0].text : "";
			return new Text(text.slice(0, 100), 0, 0);
		},
	});

	// ── web_read tool ───────────────────────────────────────────────

	pi.registerTool({
		name: "web_read",
		label: "Web Read",
		description:
			"Fetch a URL and convert it to clean markdown (main content only, no menus). Falls back to a rendering service for JavaScript apps, bot walls and PDFs. Refuses localhost and private-network addresses. Use after web_search to read full content.",
		parameters: Type.Object({
			url: Type.String({ description: "URL to fetch" }),
			max_length: Type.Optional(Type.Number({ description: "Max characters to return (default 10000)" })),
		}),
		async execute(_id, params, signal, _onUpdate, _ctx) {
			const maxLen = params.max_length || 10000;

			try {
				const page = await readPage(params.url, { signal, jinaApiKey: jinaApiKey(), maxChars: maxLen });
				let content = page.markdown;
				if (content.length > maxLen) {
					content = `${content.slice(0, maxLen)}\n\n... (truncated, ${page.markdown.length} total chars; pass a larger max_length for more)`;
				}
				const header = `${page.title ? `# ${page.title}\n` : ""}Source: ${page.url}${page.backend === "direct" ? "" : ` (via ${page.backend})`}\n\n`;
				const note = page.failures.length > 0 ? `\n\n_(${page.failures.join("; ")})_` : "";

				return {
					content: [{ type: "text", text: `${header}${content}${note}` }],
					details: { url: page.url, length: content.length, backend: page.backend },
				};
			} catch (err) {
				return {
					content: [{ type: "text", text: `Failed to read ${params.url}: ${errorMessage(err)}` }],
					details: { url: params.url, length: 0 },
					isError: true,
				};
			}
		},
		renderCall(args, theme) {
			const url = (args.url || "").replace(/^https?:\/\//, "").slice(0, 60);
			return new Text(theme.fg("toolTitle", theme.bold("web_read ")) + theme.fg("accent", url), 0, 0);
		},
		renderResult(result, _opts, theme) {
			const d = detailFields(result.details, "length", "url");
			if (d && d.num > 0) {
				const url = d.str.replace(/^https?:\/\//, "").slice(0, 40);
				return new Text(theme.fg("success", "✓ ") + theme.fg("dim", `${url} (${Math.round(d.num / 1000)}k chars)`), 0, 0);
			}
			return new Text(result.content[0]?.type === "text" ? result.content[0].text.slice(0, 80) : "", 0, 0);
		},
	});
}
