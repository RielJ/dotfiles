import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
	type FetchFn,
	isDdgChallenge,
	parseDdgLite,
	parseJinaResults,
	searchWeb,
	unwrapDdgUrl,
} from "../_web-search-core.ts";

// Trimmed from a real lite.duckduckgo.com response (2026-11-11).
const LITE_HTML = `
<table>
  <tr><td valign="top">1.&nbsp;</td><td>
    <a rel="nofollow" href="//duckduckgo.com/l/?uddg=https%3A%2F%2Fkeepassxc.org%2F&amp;rut=7441" class='result-link'>KeePassXC Password Manager</a>
  </td></tr>
  <tr><td>&nbsp;&nbsp;&nbsp;</td><td class='result-snippet'>
    The Project <b>KeePassXC</b> is a modern, secure &amp; open-source password manager.
  </td></tr>
  <tr><td>&nbsp;&nbsp;&nbsp;</td><td><span class='link-text'>keepassxc.org</span></td></tr>
  <tr><td valign="top">2.&nbsp;</td><td>
    <a rel="nofollow" href="//duckduckgo.com/y.js?ad_domain=example.com&amp;u3=x" class='result-link'>Sponsored thing</a>
  </td></tr>
  <tr><td valign="top">3.&nbsp;</td><td>
    <a rel="nofollow" href="//duckduckgo.com/l/?uddg=https%3A%2F%2Fgithub.com%2Fkeepassxreboot%2Fkeepassxc&amp;rut=89a9" class='result-link'>GitHub - keepassxreboot/keepassxc: KeePassXC is a cross-platform ...</a>
  </td></tr>
  <tr><td>&nbsp;&nbsp;&nbsp;</td><td><span class='link-text'>github.com/keepassxreboot/keepassxc</span></td></tr>
</table>`;

// Trimmed from the page DuckDuckGo serves to clients it flags as bots (HTTP 202).
const CHALLENGE_HTML = `<form id="challenge-form" action="//duckduckgo.com/anomaly.js?sv=lite&cc=botnet" method="POST">
<div class="anomaly-modal__mask"><div class="anomaly-modal__modal" data-testid="anomaly-modal">Unfortunately, bots use DuckDuckGo too.</div></div></form>`;

const JINA_MARKDOWN = `Title: keepassxc at DuckDuckGo

1.[KeePassXC Password Manager](https://duckduckgo.com/l/?uddg=https%3A%2F%2Fkeepassxc.org%2F&rut=1)
The Project KeePassXC is a modern password manager.
keepassxc.org/
2.[Download - KeePassXC](https://keepassxc.org/download/)
Get it for every platform.`;

type Route = (url: string, init?: RequestInit) => Response | Promise<Response>;

function fakeFetch(route: Route): { fn: FetchFn; calls: { url: string; headers: Record<string, string> }[] } {
	const calls: { url: string; headers: Record<string, string> }[] = [];
	const fn = (async (input: string | URL | Request, init?: RequestInit) => {
		const url = String(input);
		calls.push({ url, headers: { ...(init?.headers as Record<string, string>) } });
		init?.signal?.throwIfAborted();
		return route(url, init);
	}) as FetchFn;
	return { fn, calls };
}

const isJina = (url: string) => url.startsWith("https://r.jina.ai/");
const isExa = (url: string) => url.startsWith("https://mcp.exa.ai/");
const EXA_DOWN = () => new Response("upstream error", { status: 502 });
/** A real web_search_exa reply (trimmed), as server-sent events. */
const EXA_SSE = `event: message
data: ${JSON.stringify({
	result: {
		content: [
			{
				type: "text",
				text: "Title: KeePassXC Password Manager\nURL: https://keepassxc.org/\nPublished: N/A\nAuthor: KeePassXC Team\nHighlights:\nKeePassXC Password Manager\n\n# KeePassXC\n\nCross-platform Password Manager\n---\nTitle: KeePassXC: Getting Started Guide\nURL: https://keepassxc.org/docs/KeePassXC_GettingStarted\nPublished: N/A\nAuthor: KeePassXC Team\nHighlights:\n## Welcome\n\nKeePassXC is a modern, secure, and open-source password manager.",
			},
		],
	},
	jsonrpc: "2.0",
	id: 1,
})}

`;

describe("parseDdgLite", () => {
	it("extracts title, unwrapped url and snippet, and skips ads", () => {
		const results = parseDdgLite(LITE_HTML);
		assert.deepEqual(results, [
			{
				title: "KeePassXC Password Manager",
				url: "https://keepassxc.org/",
				snippet: "The Project KeePassXC is a modern, secure & open-source password manager.",
			},
			{
				title: "GitHub - keepassxreboot/keepassxc: KeePassXC is a cross-platform ...",
				url: "https://github.com/keepassxreboot/keepassxc",
				snippet: "",
			},
		]);
	});

	it("does not take the next result's snippet when one has none", () => {
		const [, second] = parseDdgLite(LITE_HTML);
		assert.equal(second.snippet, "");
	});

	it("returns nothing for a page without results", () => {
		assert.deepEqual(parseDdgLite("<html><body>No results.</body></html>"), []);
	});

	it("caps at 10 results", () => {
		const one = `<a href="//duckduckgo.com/l/?uddg=https%3A%2F%2Fa.example%2F" class='result-link'>A</a>`;
		assert.equal(parseDdgLite(one.repeat(15)).length, 10);
	});
});

describe("helpers", () => {
	it("recognises the challenge page and not a results page", () => {
		assert.equal(isDdgChallenge(CHALLENGE_HTML), true);
		assert.equal(isDdgChallenge(LITE_HTML), false);
	});

	it("unwraps redirect links and leaves direct links alone", () => {
		assert.equal(unwrapDdgUrl("//duckduckgo.com/l/?uddg=https%3A%2F%2Fx.dev%2Fa%3Fb%3D1&amp;rut=z"), "https://x.dev/a?b=1");
		assert.equal(unwrapDdgUrl("https://keepassxc.org/download/"), "https://keepassxc.org/download/");
	});

	it("parses Jina's markdown rendering", () => {
		const results = parseJinaResults(JINA_MARKDOWN);
		assert.equal(results.length, 2);
		assert.deepEqual(results[0], {
			title: "KeePassXC Password Manager",
			url: "https://keepassxc.org/",
			snippet: "The Project KeePassXC is a modern password manager.",
		});
	});
});

describe("searchWeb", () => {
	it("uses DuckDuckGo directly with a browser user agent, and never calls Jina when that works", async () => {
		const { fn, calls } = fakeFetch(() => new Response(LITE_HTML));
		const outcome = await searchWeb('"cellexialabs.com" scam', { fetchFn: fn });
		assert.equal(outcome.backend, "duckduckgo");
		assert.equal(outcome.results.length, 2);
		assert.deepEqual(outcome.failures, []);
		assert.equal(calls.length, 1);
		assert.equal(calls[0].url, "https://lite.duckduckgo.com/lite/?q=%22cellexialabs.com%22%20scam");
		assert.match(calls[0].headers["User-Agent"], /Chrome/);
	});

	it("treats a real results page with zero results as an answer", async () => {
		const { fn, calls } = fakeFetch(() => new Response("<html>No more results.</html>"));
		const outcome = await searchWeb("zzzz", { fetchFn: fn });
		assert.equal(outcome.backend, "duckduckgo");
		assert.deepEqual(outcome.results, []);
		assert.equal(calls.length, 1);
	});

	it("falls back to Jina on the challenge page and says why", async () => {
		const { fn, calls } = fakeFetch((url) =>
			isJina(url) ? new Response(JINA_MARKDOWN) : isExa(url) ? EXA_DOWN() : new Response(CHALLENGE_HTML, { status: 202 }),
		);
		const outcome = await searchWeb("keepassxc", { fetchFn: fn, jinaApiKey: "test-key" });
		assert.equal(outcome.backend, "jina");
		assert.equal(outcome.results.length, 2);
		assert.match(outcome.failures[0], /^duckduckgo: .*challenge/);
		assert.match(outcome.failures[1], /^exa: Exa HTTP 502/);
		assert.equal(calls[2].url, "https://r.jina.ai/https://lite.duckduckgo.com/lite/?q=keepassxc");
		assert.equal(calls[2].headers.Authorization, "Bearer test-key");
	});

	it("sends no Authorization header without a Jina key", async () => {
		const { fn, calls } = fakeFetch((url) => (isJina(url) ? new Response(JINA_MARKDOWN) : new Response("down", { status: 503 })));
		await searchWeb("x", { fetchFn: fn });
		assert.equal(calls[2].headers.Authorization, undefined);
	});

	it("reports every backend's reason, including Jina's error body, when all fail", async () => {
		const abuse = "AbuseAlleviationError: Anonymous access to domain lite.duckduckgo.com blocked until Tue Nov 10 2026";
		const { fn } = fakeFetch((url) =>
			isJina(url)
				? new Response(abuse, { status: 403, statusText: "Forbidden" })
				: isExa(url)
					? EXA_DOWN()
					: new Response(CHALLENGE_HTML, { status: 202 }),
		);
		await assert.rejects(searchWeb("x", { fetchFn: fn }), (err: Error) => {
			assert.match(err.message, /duckduckgo: .*challenge/);
			assert.match(err.message, /exa: Exa HTTP 502/);
			assert.match(err.message, /jina: Jina Reader HTTP 403 Forbidden: AbuseAlleviationError/);
			return true;
		});
	});

	it("falls back when DuckDuckGo throws a network error", async () => {
		const { fn } = fakeFetch((url) => {
			if (!isExa(url)) throw new TypeError("fetch failed");
			return new Response(EXA_SSE);
		});
		const outcome = await searchWeb("x", { fetchFn: fn });
		assert.equal(outcome.backend, "exa");
		assert.deepEqual(outcome.failures, ["duckduckgo: fetch failed"]);
		assert.deepEqual(
			outcome.results.map((r) => r.url),
			["https://keepassxc.org/", "https://keepassxc.org/docs/KeePassXC_GettingStarted"],
		);
	});

	it("sends Exa a JSON-RPC tools/call for web_search_exa", async () => {
		const bodies: string[] = [];
		const { fn } = fakeFetch((url, init) => {
			if (!isExa(url)) return new Response(CHALLENGE_HTML, { status: 202 });
			bodies.push(String(init?.body));
			return new Response(EXA_SSE);
		});
		await searchWeb("keepassxc", { fetchFn: fn });
		const body = JSON.parse(bodies[0]);
		assert.equal(body.method, "tools/call");
		assert.equal(body.params.name, "web_search_exa");
		assert.equal(body.params.arguments.query, "keepassxc");
	});

	it("stops without trying the fallback when the caller aborts", async () => {
		const controller = new AbortController();
		controller.abort();
		const { fn, calls } = fakeFetch(() => new Response(LITE_HTML));
		await assert.rejects(searchWeb("x", { fetchFn: fn, signal: controller.signal }));
		assert.equal(calls.length, 1);
	});
});
