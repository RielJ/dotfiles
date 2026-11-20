/**
 * Page reading for web_read, kept free of pi imports so tests can run it.
 *
 * Order:
 *   1. Direct fetch (SSRF-guarded, see _web-fetch.ts) converted locally with _html-markdown.ts.
 *      Fast, free, and the page never passes through a third party.
 *   2. Exa's keyless web_fetch_exa, for pages the direct path can't use: bot walls, HTTP errors,
 *      PDFs and other binary files, and JavaScript apps whose HTML holds almost no text.
 *   3. Jina Reader, which renders JavaScript server-side. Set JINA_API_KEY to avoid its abuse blocks.
 * A URL the guard blocks (private or local address, non-http scheme) is never sent to a fallback:
 * the services couldn't reach it, and its address would leak to them. Neither is a 404/410.
 * When every fallback fails but the direct fetch got a thin page, that page is returned.
 */

import { exaFetch, type FetchFn } from "./_exa.ts";
import { htmlToMarkdown } from "./_html-markdown.ts";
import { BlockedUrlError, type DirectResponse, fetchDirect, normalizeUrl } from "./_web-fetch.ts";
import { fetchJina } from "./_web-search-core.ts";

/** The site says the page doesn't exist (404/410); no fallback is tried. */
export class PageGoneError extends Error {
	override name = "PageGoneError";
}

export type ReadBackend = "direct" | "exa" | "jina";

export interface ReadOutcome {
	backend: ReadBackend;
	/** Final URL (after redirects for the direct path). */
	url: string;
	title: string;
	markdown: string;
	/** Backends tried before the one that answered, with the reason each failed. */
	failures: string[];
}

export interface ReadOptions {
	signal?: AbortSignal;
	jinaApiKey?: string;
	/** Characters wanted by the caller; Exa is asked for a little more so truncation stays visible. */
	maxChars?: number;
	fetchFn?: FetchFn;
	direct?: (url: string, opts: { signal?: AbortSignal }) => Promise<DirectResponse>;
	timeoutMs?: number;
}

/** Below this many visible characters an HTML page is probably a JavaScript shell or a wall. */
export const THIN_PAGE_CHARS = 400;

/** Interstitials that return HTTP 200 with no content: Cloudflare, DataDome, "enable JavaScript" shells. */
const WALL =
	/just a moment\.\.\.|cf-browser-verification|challenge-platform|enable javascript and cookies|please enable javascript|you need to enable javascript|checking your browser|captcha-delivery/i;

const HTML_TYPE = /^(text\/html|application\/xhtml\+xml)/i;

function reason(err: unknown): string {
	if (err instanceof Error) return err.name === "TimeoutError" ? "timed out" : err.message;
	return String(err);
}

function visibleLength(markdown: string): number {
	return markdown
		.replace(/!?\[([^\]]*)\]\([^)]*\)/g, "$1")
		.replace(/\s+/g, "").length;
}

type DirectVerdict =
	| { kind: "ok"; outcome: ReadOutcome }
	| { kind: "gone"; why: string }
	| { kind: "thin"; outcome: ReadOutcome; why: string }
	| { kind: "unusable"; why: string };

/** Decides whether a direct response is good enough to return, worth keeping as a last resort, or unusable. */
export function judgeDirect(resp: DirectResponse): DirectVerdict {
	// 404/410 are real answers; a service would only fetch the same missing page. Bot walls use 403, 429 or 503.
	if (resp.status === 404 || resp.status === 410) return { kind: "gone", why: `HTTP ${resp.status}: the page does not exist` };
	if (resp.status >= 400) return { kind: "unusable", why: `HTTP ${resp.status}` };
	if (resp.text === null) return { kind: "unusable", why: `${resp.contentType.split(";")[0] || "binary"} is not text` };
	const base = { backend: "direct" as const, url: resp.url, failures: [] };
	if (!HTML_TYPE.test(resp.contentType)) {
		return { kind: "ok", outcome: { ...base, title: "", markdown: resp.text.trim() } };
	}
	const page = htmlToMarkdown(resp.text, resp.url);
	const outcome = { ...base, title: page.title, markdown: page.markdown };
	if (WALL.test(resp.text.slice(0, 20_000)) && visibleLength(page.markdown) < 2_000) {
		return { kind: "thin", outcome, why: "bot or JavaScript wall" };
	}
	const len = visibleLength(page.markdown);
	if (len < THIN_PAGE_CHARS) return { kind: "thin", outcome, why: `only ${len} characters of text (JavaScript app?)` };
	return { kind: "ok", outcome };
}

/** Splits Exa's `# Title\nURL: …\nAuthor: …\n\n` header from the page body. */
export function parseExaPage(text: string, fallbackUrl: string): { title: string; url: string; markdown: string } {
	const title = text.match(/^# (.*)$/m)?.[1]?.trim() ?? "";
	const url = text.match(/^URL:\s*(\S+)/m)?.[1] ?? fallbackUrl;
	const headerEnd = text.search(/\n\s*\n/);
	const markdown = (headerEnd >= 0 ? text.slice(headerEnd) : text).trim();
	return { title: title === "(no title)" ? "" : title, url, markdown };
}

/**
 * Reads a page as markdown. Throws BlockedUrlError for guarded URLs, and an Error naming every
 * backend's reason when nothing usable came back.
 */
export async function readPage(rawUrl: string, opts: ReadOptions = {}): Promise<ReadOutcome> {
	const url = normalizeUrl(rawUrl);
	const failures: string[] = [];
	const timeoutMs = opts.timeoutMs ?? 30_000;
	let lastResort: ReadOutcome | null = null;

	try {
		const resp = await (opts.direct ?? fetchDirect)(url, { signal: opts.signal });
		const verdict = judgeDirect(resp);
		if (verdict.kind === "ok") return verdict.outcome;
		if (verdict.kind === "gone") throw new PageGoneError(`${resp.url}: ${verdict.why}`);
		if (verdict.kind === "thin") lastResort = verdict.outcome;
		failures.push(`direct: ${verdict.why}`);
	} catch (err) {
		if (err instanceof BlockedUrlError || err instanceof PageGoneError || opts.signal?.aborted) throw err;
		failures.push(`direct: ${reason(err)}`);
	}

	try {
		const maxCharacters = Math.max(1_000, Math.min((opts.maxChars ?? 10_000) + 2_000, 100_000));
		const page = parseExaPage(await exaFetch(url, maxCharacters, { fetchFn: opts.fetchFn, signal: opts.signal, timeoutMs }), url);
		if (visibleLength(page.markdown) > 0) return { backend: "exa", ...page, failures };
		failures.push("exa: empty page");
	} catch (err) {
		if (opts.signal?.aborted) throw err;
		failures.push(`exa: ${reason(err)}`);
	}

	try {
		const markdown = await fetchJina(url, { fetchFn: opts.fetchFn, signal: opts.signal, apiKey: opts.jinaApiKey, timeoutMs });
		const title = markdown.match(/^Title:\s*(.*)$/m)?.[1]?.trim() ?? "";
		return { backend: "jina", url, title, markdown, failures };
	} catch (err) {
		if (opts.signal?.aborted) throw err;
		failures.push(`jina: ${reason(err)}`);
	}

	if (lastResort) return { ...lastResort, failures };
	throw new Error(`Could not read ${url}. ${failures.join(" | ")}`);
}
