/**
 * Search backends for web_search, kept free of pi imports so tests can run them.
 *
 * Order: DuckDuckGo Lite fetched directly, then Exa's keyless MCP search, then Jina Reader
 * wrapping the DuckDuckGo page. Anonymous Jina access to lite.duckduckgo.com is often blocked
 * for abuse (HTTP 403), so Jina is last. Set JINA_API_KEY to make it authenticated.
 */

import { exaSearch } from "./_exa.ts";

export interface SearchResult {
	title: string;
	url: string;
	snippet: string;
}

export interface SearchOutcome {
	backend: "duckduckgo" | "exa" | "jina";
	results: SearchResult[];
	/** Backends tried before the one that answered, with the reason each failed. */
	failures: string[];
}

export type FetchFn = typeof fetch;

export const DDG_LITE = "https://lite.duckduckgo.com/lite/?q=";
export const JINA_READER = "https://r.jina.ai/";
const BROWSER_UA =
	"Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130 Safari/537.36";
const BACKEND_TIMEOUT_MS = 20_000;
const MAX_RESULTS = 10;

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", "#39": "'", "#x27": "'" };

function decodeEntities(s: string): string {
	return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (whole, name: string) => {
		const known = ENTITIES[name.toLowerCase()];
		if (known !== undefined) return known;
		if (name.startsWith("#x") || name.startsWith("#X")) return String.fromCodePoint(Number.parseInt(name.slice(2), 16));
		if (name.startsWith("#")) return String.fromCodePoint(Number.parseInt(name.slice(1), 10));
		return whole;
	});
}

function htmlToText(s: string): string {
	return decodeEntities(s.replace(/<[^>]+>/g, "")).replace(/\s+/g, " ").trim();
}

/** Turns a DuckDuckGo redirect (`//duckduckgo.com/l/?uddg=…`) into the target URL. */
export function unwrapDdgUrl(href: string): string {
	const raw = decodeEntities(href);
	const target = raw.match(/[?&]uddg=([^&]+)/);
	if (target) return decodeURIComponent(target[1]);
	return raw.startsWith("//") ? `https:${raw}` : raw;
}

/** True when DuckDuckGo returned its bot challenge instead of results. */
export function isDdgChallenge(html: string): boolean {
	return /anomaly-modal|anomaly\.js/.test(html);
}

/** Parses the HTML of lite.duckduckgo.com. Ads (duckduckgo.com/y.js links) are skipped. */
export function parseDdgLite(html: string): SearchResult[] {
	const results: SearchResult[] = [];
	const links = [...html.matchAll(/<a\b[^>]*class=['"]result-link['"][^>]*>([\s\S]*?)<\/a>/g)];
	for (let i = 0; i < links.length && results.length < MAX_RESULTS; i++) {
		const link = links[i];
		const href = link[0].match(/href=(["'])(.*?)\1/)?.[2];
		if (!href) continue;
		const url = unwrapDdgUrl(href);
		if (/duckduckgo\.com\/y\.js/.test(url)) continue;
		const start = (link.index ?? 0) + link[0].length;
		const end = links[i + 1]?.index ?? html.length;
		const snippet = html.slice(start, end).match(/class=['"]result-snippet['"][^>]*>([\s\S]*?)<\/td>/)?.[1];
		results.push({ title: htmlToText(link[1]), url, snippet: snippet ? htmlToText(snippet).slice(0, 300) : "" });
	}
	return results;
}

/** Parses DuckDuckGo Lite as rendered to markdown by Jina: `1.[Title](url)` then snippet lines. */
export function parseJinaResults(markdown: string): SearchResult[] {
	const results: SearchResult[] = [];
	const lines = markdown.split("\n");
	let i = 0;
	while (i < lines.length && results.length < MAX_RESULTS) {
		const match = lines[i].match(/^\d+\.\[([^\]]+)\]\(([^)]+)\)/);
		i++;
		if (!match) continue;
		const snippetLines: string[] = [];
		while (i < lines.length && !/^\d+\.\[/.test(lines[i])) {
			const line = lines[i].trim();
			const metadata = /^[a-z0-9.-]+\.(com|org|net|io|dev|ai|co)\//i.test(line) || /^\d{4}-\d{2}-\d{2}/.test(line);
			if (line && !metadata) snippetLines.push(line);
			i++;
		}
		results.push({ title: match[1], url: unwrapDdgUrl(match[2]), snippet: snippetLines.join(" ").slice(0, 300) });
	}
	return results;
}

/** Reads an error response body, compacted, so the reason (e.g. Jina's AbuseAlleviationError) reaches the agent. */
async function errorText(resp: Response): Promise<string> {
	let body = "";
	try {
		body = (await resp.text()).replace(/\s+/g, " ").trim().slice(0, 300);
	} catch {
		body = "";
	}
	return `HTTP ${resp.status}${resp.statusText ? ` ${resp.statusText}` : ""}${body ? `: ${body}` : ""}`;
}

function withTimeout(signal: AbortSignal | undefined, ms: number): AbortSignal {
	const timeout = AbortSignal.timeout(ms);
	return signal ? AbortSignal.any([signal, timeout]) : timeout;
}

export interface JinaOptions {
	fetchFn?: FetchFn;
	signal?: AbortSignal;
	apiKey?: string;
	timeoutMs?: number;
}

/** Fetches a URL through Jina Reader as plain text/markdown. Throws with the response body on failure. */
export async function fetchJina(url: string, opts: JinaOptions = {}): Promise<string> {
	const headers: Record<string, string> = { Accept: "text/plain", "User-Agent": "Mozilla/5.0 (compatible; PiAgent/1.0)" };
	if (opts.apiKey) headers.Authorization = `Bearer ${opts.apiKey}`;
	const resp = await (opts.fetchFn ?? fetch)(`${JINA_READER}${url}`, {
		headers,
		signal: withTimeout(opts.signal, opts.timeoutMs ?? 30_000),
	});
	if (!resp.ok) throw new Error(`Jina Reader ${await errorText(resp)}`);
	return resp.text();
}

async function searchDuckDuckGo(query: string, fetchFn: FetchFn, signal: AbortSignal | undefined): Promise<SearchResult[]> {
	const resp = await fetchFn(`${DDG_LITE}${encodeURIComponent(query)}`, {
		headers: { "User-Agent": BROWSER_UA, Accept: "text/html" },
		signal: withTimeout(signal, BACKEND_TIMEOUT_MS),
	});
	if (!resp.ok) throw new Error(`DuckDuckGo ${await errorText(resp)}`);
	const html = await resp.text();
	if (isDdgChallenge(html)) throw new Error("DuckDuckGo returned its bot challenge page instead of results");
	return parseDdgLite(html);
}

function reason(err: unknown): string {
	if (err instanceof Error) return err.name === "TimeoutError" ? "timed out" : err.message;
	return String(err);
}

export interface SearchOptions {
	fetchFn?: FetchFn;
	signal?: AbortSignal;
	jinaApiKey?: string;
}

/**
 * Searches DuckDuckGo directly, falling back to Exa, then Jina Reader.
 * Zero results from a real results page count as an answer, not a failure.
 * Throws one error naming every backend's reason when all fail.
 */
export async function searchWeb(query: string, opts: SearchOptions = {}): Promise<SearchOutcome> {
	const fetchFn = opts.fetchFn ?? fetch;
	const failures: string[] = [];
	try {
		return { backend: "duckduckgo", results: await searchDuckDuckGo(query, fetchFn, opts.signal), failures };
	} catch (err) {
		if (opts.signal?.aborted) throw err;
		failures.push(`duckduckgo: ${reason(err)}`);
	}
	try {
		const results = await exaSearch(query, MAX_RESULTS, { fetchFn, signal: opts.signal, timeoutMs: BACKEND_TIMEOUT_MS });
		return { backend: "exa", results, failures };
	} catch (err) {
		if (opts.signal?.aborted) throw err;
		failures.push(`exa: ${reason(err)}`);
	}
	try {
		const markdown = await fetchJina(`${DDG_LITE}${encodeURIComponent(query)}`, {
			fetchFn,
			signal: opts.signal,
			apiKey: opts.jinaApiKey,
			timeoutMs: BACKEND_TIMEOUT_MS,
		});
		return { backend: "jina", results: parseJinaResults(markdown), failures };
	} catch (err) {
		if (opts.signal?.aborted) throw err;
		failures.push(`jina: ${reason(err)}`);
	}
	throw new Error(`All search backends failed. ${failures.join(" | ")}`);
}
