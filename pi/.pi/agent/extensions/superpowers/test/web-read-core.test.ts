import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { parseExaSearch, parseMcpBody, toolText, type FetchFn } from "../_exa.ts";
import { BlockedUrlError, type DirectResponse } from "../_web-fetch.ts";
import { judgeDirect, PageGoneError, parseExaPage, readPage } from "../_web-read-core.ts";

const article = (words: number) =>
	`<html><head><title>Guide</title></head><body><nav>Home</nav><main><h1>Guide</h1><p>${Array(words).fill("word").join(" ")}</p></main></body></html>`;

const html = (text: string, extra: Partial<DirectResponse> = {}): DirectResponse => ({
	url: "https://example.com/page",
	status: 200,
	contentType: "text/html; charset=utf-8",
	text,
	truncated: false,
	...extra,
});

const sse = (result: unknown) => `event: message\ndata: ${JSON.stringify({ jsonrpc: "2.0", id: 1, result })}\n\n`;
const EXA_PAGE = sse({ content: [{ type: "text", text: "# Rendered App\nURL: https://example.com/page\nAuthor: Team\n\nThe rendered body text." }] });
const EXA_CRAWL_ERROR = sse({ content: [{ type: "text", text: "Error fetching URL(s): https://example.com/page: CRAWL_NOT_FOUND" }], isError: true });

type Route = (url: string) => Response;
function fakeFetch(route: Route): { fn: FetchFn; urls: string[] } {
	const urls: string[] = [];
	const fn = (async (input: string | URL | Request, init?: RequestInit) => {
		urls.push(String(input));
		init?.signal?.throwIfAborted();
		return route(String(input));
	}) as FetchFn;
	return { fn, urls };
}
const isExa = (u: string) => u.startsWith("https://mcp.exa.ai/");
const isJina = (u: string) => u.startsWith("https://r.jina.ai/");

describe("Exa MCP parsing", () => {
	it("reads the reply from server-sent events or plain JSON", () => {
		assert.deepEqual(parseMcpBody(EXA_PAGE), {
			kind: "result",
			text: "# Rendered App\nURL: https://example.com/page\nAuthor: Team\n\nThe rendered body text.",
			isError: false,
		});
		assert.deepEqual(parseMcpBody(JSON.stringify({ jsonrpc: "2.0", id: 2, error: { code: -32602, message: "Unknown tool: x" } })), {
			kind: "error",
			message: "Unknown tool: x",
		});
		assert.throws(() => parseMcpBody("<html>bad gateway</html>"), /no JSON-RPC reply/);
	});
	it("turns tool errors and protocol errors into thrown errors with Exa's text", () => {
		assert.throws(() => toolText(parseMcpBody(EXA_CRAWL_ERROR)), /CRAWL_NOT_FOUND/);
		assert.throws(() => toolText({ kind: "error", message: "Unknown tool: x" }), /Exa error: Unknown tool/);
	});
	it("parses search blocks and skips blocks without a URL", () => {
		const results = parseExaSearch("Title: A\nURL: https://a.example/\nHighlights:\n# A\n\nAbout A\n---\nTitle: no url\n---\nURL: https://b.example/\n");
		assert.deepEqual(results, [
			{ title: "A", url: "https://a.example/", snippet: "A About A" },
			{ title: "https://b.example/", url: "https://b.example/", snippet: "" },
		]);
	});
	it("splits an Exa page header from its body", () => {
		assert.deepEqual(parseExaPage("# (no title)\nURL: https://x.example/\n\nBody", "https://fallback/"), {
			title: "",
			url: "https://x.example/",
			markdown: "Body",
		});
	});
});

describe("judgeDirect", () => {
	it("accepts a real article", () => {
		const v = judgeDirect(html(article(200)));
		assert.equal(v.kind, "ok");
		if (v.kind === "ok") {
			assert.equal(v.outcome.title, "Guide");
			assert.ok(!v.outcome.markdown.includes("Home"));
		}
	});
	it("marks a JavaScript shell as thin", () => {
		assert.equal(judgeDirect(html('<body><div id="root"></div><script src="app.js"></script></body>')).kind, "thin");
	});
	it("marks a Cloudflare wall as thin even with some text", () => {
		const wall = `<title>Just a moment...</title><body><p>${Array(150).fill("checking").join(" ")}</p></body>`;
		const v = judgeDirect(html(wall));
		assert.equal(v.kind, "thin");
		if (v.kind === "thin") assert.match(v.why, /wall/);
	});
	it("rejects HTTP errors and binary bodies", () => {
		assert.deepEqual(judgeDirect(html("x", { status: 403 })), { kind: "unusable", why: "HTTP 403" });
		assert.deepEqual(judgeDirect(html("", { text: null, contentType: "application/pdf" })), {
			kind: "unusable",
			why: "application/pdf is not text",
		});
	});
	it("returns non-HTML text as is", () => {
		const v = judgeDirect(html('{"a":1}', { contentType: "application/json" }));
		assert.equal(v.kind === "ok" && v.outcome.markdown, '{"a":1}');
	});
});

describe("readPage", () => {
	it("uses the direct fetch and never calls a service when the page is good", async () => {
		const { fn, urls } = fakeFetch(() => new Response("unexpected"));
		const page = await readPage("example.com/page", { fetchFn: fn, direct: async () => html(article(200)) });
		assert.equal(page.backend, "direct");
		assert.deepEqual(urls, []);
	});
	it("adds https:// to a bare host", async () => {
		let seen = "";
		await readPage("example.com/page", {
			direct: async (u) => {
				seen = u;
				return html(article(200));
			},
		});
		assert.equal(seen, "https://example.com/page");
	});
	it("falls back to Exa for a PDF, and says why", async () => {
		const { fn, urls } = fakeFetch((u) => (isExa(u) ? new Response(EXA_PAGE) : new Response("no", { status: 500 })));
		const page = await readPage("https://example.com/paper.pdf", {
			fetchFn: fn,
			direct: async () => html("", { text: null, contentType: "application/pdf" }),
		});
		assert.equal(page.backend, "exa");
		assert.equal(page.title, "Rendered App");
		assert.equal(page.markdown, "The rendered body text.");
		assert.deepEqual(page.failures, ["direct: application/pdf is not text"]);
		assert.equal(urls.length, 1);
	});
	it("falls back to Jina when Exa reports a crawl error", async () => {
		const { fn } = fakeFetch((u) => (isExa(u) ? new Response(EXA_CRAWL_ERROR) : isJina(u) ? new Response("Title: J\n\nBody") : new Response("")));
		const page = await readPage("https://example.com/page", { fetchFn: fn, direct: async () => html("x", { status: 403 }) });
		assert.equal(page.backend, "jina");
		assert.equal(page.title, "J");
		assert.match(page.failures[1], /^exa: .*CRAWL_NOT_FOUND/);
	});
	it("returns the thin direct page when every service fails", async () => {
		const { fn } = fakeFetch(() => new Response("down", { status: 503 }));
		const shell = '<title>App</title><body><p>Loading the app</p></body>';
		const page = await readPage("https://example.com/page", { fetchFn: fn, direct: async () => html(shell) });
		assert.equal(page.backend, "direct");
		assert.equal(page.markdown, "Loading the app");
		assert.equal(page.failures.length, 3);
	});
	it("throws with every reason when nothing usable came back", async () => {
		const { fn } = fakeFetch(() => new Response("down", { status: 503 }));
		await assert.rejects(
			readPage("https://example.com/page", { fetchFn: fn, direct: async () => html("x", { status: 403 }) }),
			/direct: HTTP 403 \| exa: .* \| jina: /,
		);
	});
	it("treats 404 and 410 as final and calls no service", async () => {
		for (const status of [404, 410]) {
			const { fn, urls } = fakeFetch(() => new Response(EXA_PAGE));
			await assert.rejects(readPage("https://example.com/gone", { fetchFn: fn, direct: async () => html("x", { status }) }), PageGoneError);
			assert.deepEqual(urls, []);
		}
	});
	it("never forwards a blocked URL to Exa or Jina", async () => {
		const { fn, urls } = fakeFetch(() => new Response(EXA_PAGE));
		await assert.rejects(
			readPage("http://169.254.169.254/latest/meta-data", {
				fetchFn: fn,
				direct: async () => {
					throw new BlockedUrlError("169.254.169.254 is a private or local address");
				},
			}),
			BlockedUrlError,
		);
		assert.deepEqual(urls, []);
	});
	it("stops on abort without trying fallbacks", async () => {
		const controller = new AbortController();
		const { fn, urls } = fakeFetch(() => new Response(EXA_PAGE));
		await assert.rejects(
			readPage("https://example.com/page", {
				fetchFn: fn,
				signal: controller.signal,
				direct: async () => {
					controller.abort();
					throw new Error("aborted");
				},
			}),
		);
		assert.deepEqual(urls, []);
	});
});
