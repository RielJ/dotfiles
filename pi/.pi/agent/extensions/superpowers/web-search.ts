/**
 * Web Search — Search the web and read pages via Jina Reader
 *
 * Uses free APIs (no keys required):
 *   - DuckDuckGo Lite + Jina Reader for search results
 *   - Jina Reader (r.jina.ai) for reading full page content
 *
 * Tools:
 *   web_search — search DuckDuckGo, returns titles + snippets + URLs
 *   web_read   — fetch a URL and convert to clean markdown
 *
 * Why not Playwright?
 *   Playwright is heavy (spawns a browser), slow, and uses many tokens
 *   for DOM snapshots. Jina Reader is free, fast, handles JS rendering
 *   server-side, and returns clean markdown. Use Playwright only when
 *   you need interaction (clicking, form filling, auth).
 */

import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { Text } from "@mariozechner/pi-tui";
import { Type } from "@sinclair/typebox";

// ── Module Metadata ─────────────────────────────────────────────────

export const module = {
	id: "web-search",
	name: "Web Search",
	description: "Search the web and read pages (DuckDuckGo + Jina Reader, no API keys)",
	systemPromptWhenEnabled: `### Web Search
You have two web tools:
- \`web_search\` — search DuckDuckGo, returns titles + snippets + URLs
- \`web_read\` — fetch any URL and get clean markdown content

Use web_search to find information, then web_read to read specific pages.
These are fast and free (no API keys). Prefer these over bash curl.`,
};

// ── Helpers ─────────────────────────────────────────────────────────

const JINA_READER = "https://r.jina.ai/";
const DDG_LITE = "https://lite.duckduckgo.com/lite?q=";

interface SearchResult {
	title: string;
	url: string;
	snippet: string;
}

function parseSearchResults(markdown: string): SearchResult[] {
	const results: SearchResult[] = [];
	// DuckDuckGo lite via Jina returns numbered links like:
	// 1.[Title](https://duckduckgo.com/l/?uddg=ENCODED_URL&...)
	// description text
	// domain.com/path

	const lines = markdown.split("\n");
	let i = 0;
	while (i < lines.length) {
		const line = lines[i];
		// Match numbered results: 1.[Title](url)
		const match = line.match(/^\d+\.\[([^\]]+)\]\(([^)]+)\)/);
		if (match) {
			const title = match[1];
			let rawUrl = match[2];

			// Extract actual URL from DDG redirect
			const uddgMatch = rawUrl.match(/uddg=([^&]+)/);
			if (uddgMatch) {
				rawUrl = decodeURIComponent(uddgMatch[1]);
			}

			// Next lines until next numbered result or empty are the snippet
			const snippetLines: string[] = [];
			i++;
			while (i < lines.length && !lines[i].match(/^\d+\.\[/)) {
				const sl = lines[i].trim();
				// Skip lines that look like domain/date metadata
				if (sl && !sl.match(/^[a-z0-9.-]+\.(com|org|net|io|dev|ai|co)\//i) && !sl.match(/^\d{4}-\d{2}-\d{2}/)) {
					snippetLines.push(sl);
				}
				i++;
			}

			results.push({
				title,
				url: rawUrl,
				snippet: snippetLines.join(" ").slice(0, 300),
			});

			if (results.length >= 10) break;
			continue;
		}
		i++;
	}
	return results;
}

async function fetchJina(url: string, signal?: AbortSignal): Promise<string> {
	const controller = new AbortController();
	const timeout = setTimeout(() => controller.abort(), 30000);

	// Link signal if provided
	if (signal) {
		if (signal.aborted) { clearTimeout(timeout); throw new Error("Aborted"); }
		signal.addEventListener("abort", () => controller.abort(), { once: true });
	}

	try {
		const resp = await fetch(`${JINA_READER}${url}`, {
			signal: controller.signal,
			headers: {
				"Accept": "text/plain",
				"User-Agent": "Mozilla/5.0 (compatible; PiAgent/1.0)",
			},
		});
		if (!resp.ok) throw new Error(`HTTP ${resp.status}: ${resp.statusText}`);
		return await resp.text();
	} finally {
		clearTimeout(timeout);
	}
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
				const encoded = encodeURIComponent(params.query);
				const markdown = await fetchJina(`${DDG_LITE}${encoded}`, signal);
				const results = parseSearchResults(markdown).slice(0, maxResults);

				if (results.length === 0) {
					return { content: [{ type: "text", text: `No results found for "${params.query}"` }] };
				}

				const formatted = results.map((r, i) =>
					`${i + 1}. **${r.title}**\n   ${r.url}\n   ${r.snippet}`
				).join("\n\n");

				return {
					content: [{ type: "text", text: `## Search: ${params.query}\n\n${formatted}` }],
					details: { query: params.query, resultCount: results.length, results },
				};
			} catch (err: any) {
				return {
					content: [{ type: "text", text: `Search failed: ${err.message}` }],
					isError: true,
				};
			}
		},
		renderCall(args, theme) {
			return new Text(theme.fg("toolTitle", theme.bold("web_search ")) + theme.fg("accent", `"${args.query || "?"}" `), 0, 0);
		},
		renderResult(result, _opts, theme) {
			const d = result.details as any;
			if (d?.resultCount) {
				return new Text(theme.fg("success", `✓ ${d.resultCount} results`) + theme.fg("dim", ` for "${d.query}"`), 0, 0);
			}
			const text = result.content[0]?.type === "text" ? result.content[0].text : "";
			return new Text(text.slice(0, 100), 0, 0);
		},
	});

	// ── web_read tool ───────────────────────────────────────────────

	pi.registerTool({
		name: "web_read",
		label: "Web Read",
		description: "Fetch a URL and convert to clean markdown. Handles JS-rendered pages. Use after web_search to read full content.",
		parameters: Type.Object({
			url: Type.String({ description: "URL to fetch" }),
			max_length: Type.Optional(Type.Number({ description: "Max characters to return (default 10000)" })),
		}),
		async execute(_id, params, signal, _onUpdate, _ctx) {
			const maxLen = params.max_length || 10000;

			try {
				let content = await fetchJina(params.url, signal);

				if (content.length > maxLen) {
					content = content.slice(0, maxLen) + `\n\n... (truncated, ${content.length} total chars)`;
				}

				return {
					content: [{ type: "text", text: content }],
					details: { url: params.url, length: content.length },
				};
			} catch (err: any) {
				return {
					content: [{ type: "text", text: `Failed to read ${params.url}: ${err.message}` }],
					isError: true,
				};
			}
		},
		renderCall(args, theme) {
			const url = (args.url || "").replace(/^https?:\/\//, "").slice(0, 60);
			return new Text(theme.fg("toolTitle", theme.bold("web_read ")) + theme.fg("accent", url), 0, 0);
		},
		renderResult(result, _opts, theme) {
			const d = result.details as any;
			if (d?.length) {
				const url = (d.url || "").replace(/^https?:\/\//, "").slice(0, 40);
				return new Text(theme.fg("success", "✓ ") + theme.fg("dim", `${url} (${Math.round(d.length / 1000)}k chars)`), 0, 0);
			}
			return new Text(result.content[0]?.type === "text" ? result.content[0].text.slice(0, 80) : "", 0, 0);
		},
	});
}
