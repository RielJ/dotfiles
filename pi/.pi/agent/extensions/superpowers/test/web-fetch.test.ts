import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import type { AddressInfo } from "node:net";
import zlib from "node:zlib";
import { BlockedUrlError, envAllowsPrivateNetwork, fetchDirect, isForbiddenIp, normalizeUrl } from "../_web-fetch.ts";

describe("isForbiddenIp", () => {
	// Cases follow Obscura's obscura-ssrf deny-set.
	const forbidden = [
		"127.0.0.1",
		"127.255.0.9",
		"0.0.0.0",
		"0.1.2.3",
		"10.0.0.1",
		"172.16.0.1",
		"172.31.255.255",
		"192.168.1.10",
		"169.254.169.254",
		"100.64.0.1",
		"100.100.100.200",
		"198.18.0.1",
		"192.88.99.1",
		"192.0.0.1",
		"192.0.2.5",
		"203.0.113.9",
		"224.0.0.1",
		"255.255.255.255",
		"::",
		"::1",
		"[::1]",
		"fc00::1",
		"fd12:3456::1",
		"fe80::1%en0",
		"ff02::1",
		"::ffff:127.0.0.1",
		"::ffff:169.254.169.254",
		"::127.0.0.1",
		"64:ff9b::a9fe:a9fe", // NAT64 of 169.254.169.254
		"2002:7f00:1::", // 6to4 of 127.0.0.1
		"2001:0:7f00:1::", // Teredo server 127.0.0.1
		"2001:db8::1",
		"not-an-ip",
	];
	const allowed = ["8.8.8.8", "1.1.1.1", "172.32.0.1", "100.128.0.1", "192.0.0.9", "2606:4700:4700::1111", "::ffff:8.8.8.8"];
	for (const ip of forbidden) it(`blocks ${ip}`, () => assert.equal(isForbiddenIp(ip), true));
	for (const ip of allowed) it(`allows ${ip}`, () => assert.equal(isForbiddenIp(ip), false));
});

describe("normalizeUrl", () => {
	it("adds https to a bare host", () => assert.equal(normalizeUrl(" example.com/a "), "https://example.com/a"));
	it("keeps an explicit scheme", () => assert.equal(normalizeUrl("http://x.org"), "http://x.org"));
});

describe("envAllowsPrivateNetwork", () => {
	it("reads the opt-in", () => {
		assert.equal(envAllowsPrivateNetwork({ PI_WEB_ALLOW_PRIVATE_NETWORK: "yes" }), true);
		assert.equal(envAllowsPrivateNetwork({ PI_WEB_ALLOW_PRIVATE_NETWORK: "0" }), false);
		assert.equal(envAllowsPrivateNetwork({}), false);
	});
});

describe("fetchDirect", () => {
	let server: http.Server;
	let base = "";
	const allowAll = { isForbidden: () => false };

	before(async () => {
		server = http.createServer((req, res) => {
			const path = req.url ?? "/";
			if (path === "/page") {
				res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
				return res.end("<p>héllo</p>");
			}
			if (path === "/gzip") {
				res.writeHead(200, { "Content-Type": "text/html", "Content-Encoding": "gzip" });
				return res.end(zlib.gzipSync("<p>zipped</p>"));
			}
			if (path === "/latin1") {
				res.writeHead(200, { "Content-Type": "text/plain; charset=iso-8859-1" });
				return res.end(Buffer.from([0x63, 0x61, 0x66, 0xe9]));
			}
			if (path === "/redirect") {
				res.writeHead(302, { Location: "/page" });
				return res.end();
			}
			if (path === "/loop") {
				res.writeHead(301, { Location: "/loop" });
				return res.end();
			}
			if (path === "/to-metadata") {
				res.writeHead(302, { Location: "http://169.254.169.254/latest/meta-data/" });
				return res.end();
			}
			if (path === "/big") {
				res.writeHead(200, { "Content-Type": "text/plain" });
				return res.end("x".repeat(50_000));
			}
			if (path === "/pdf") {
				res.writeHead(200, { "Content-Type": "application/pdf" });
				return res.end(Buffer.alloc(10_000));
			}
			if (path === "/slow") return; // never answers
			res.writeHead(404, { "Content-Type": "text/plain" });
			res.end("missing");
		});
		await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
		base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
	});
	after(() => {
		server.closeAllConnections();
		server.close();
	});

	it("blocks a loopback literal by default", async () => {
		await assert.rejects(fetchDirect(`${base}/page`), BlockedUrlError);
	});
	it("blocks localhost through the DNS lookup", async () => {
		const port = (server.address() as AddressInfo).port;
		await assert.rejects(fetchDirect(`http://localhost:${port}/page`), BlockedUrlError);
	});
	it("blocks non-http schemes", async () => {
		await assert.rejects(fetchDirect("file:///etc/passwd"), BlockedUrlError);
	});
	it("rejects a malformed URL with a readable error", async () => {
		await assert.rejects(fetchDirect("http://"), /not a valid URL/);
	});
	it("re-checks the redirect target", async () => {
		const onlyMetadata = { isForbidden: (ip: string) => ip === "169.254.169.254" };
		await assert.rejects(fetchDirect(`${base}/to-metadata`, onlyMetadata), BlockedUrlError);
	});
	it("reads a page and decodes utf-8", async () => {
		const r = await fetchDirect(`${base}/page`, allowAll);
		assert.equal(r.status, 200);
		assert.equal(r.text, "<p>héllo</p>");
	});
	it("follows redirects and reports the final URL", async () => {
		const r = await fetchDirect(`${base}/redirect`, allowAll);
		assert.equal(r.url, `${base}/page`);
		assert.equal(r.text, "<p>héllo</p>");
	});
	it("stops after maxRedirects", async () => {
		await assert.rejects(fetchDirect(`${base}/loop`, { ...allowAll, maxRedirects: 3 }), /more than 3 redirects/);
	});
	it("decompresses gzip", async () => {
		assert.equal((await fetchDirect(`${base}/gzip`, allowAll)).text, "<p>zipped</p>");
	});
	it("honours the declared charset", async () => {
		assert.equal((await fetchDirect(`${base}/latin1`, allowAll)).text, "café");
	});
	it("caps the body size", async () => {
		const r = await fetchDirect(`${base}/big`, { ...allowAll, maxBytes: 1000 });
		assert.equal(r.truncated, true);
		assert.equal(r.text?.length, 1000);
	});
	it("does not download binary content", async () => {
		const r = await fetchDirect(`${base}/pdf`, allowAll);
		assert.equal(r.text, null);
		assert.equal(r.contentType, "application/pdf");
	});
	it("returns non-2xx responses instead of throwing", async () => {
		const r = await fetchDirect(`${base}/nope`, allowAll);
		assert.equal(r.status, 404);
	});
	it("times out", async () => {
		await assert.rejects(fetchDirect(`${base}/slow`, { ...allowAll, timeoutMs: 300 }), /abort|timeout/i);
	});
});
