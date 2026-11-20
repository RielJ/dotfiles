import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { decodeEntities, htmlToMarkdown, parseHtml } from "../_html-markdown.ts";

const md = (html: string, url = "https://example.com/docs/page") => htmlToMarkdown(html, url).markdown;

describe("decodeEntities", () => {
	it("decodes named, decimal and hex entities", () => {
		assert.equal(decodeEntities("a &amp; b &mdash; &#8217;&#x2713; &nbsp;x"), "a & b — ’✓  x");
	});
	it("leaves unknown entities alone", () => assert.equal(decodeEntities("&bogus; &#0;"), "&bogus; &#0;"));
});

describe("parseHtml", () => {
	it("never throws on broken markup", () => {
		for (const s of ["<", "<div", "</p></p><b>", "<a href='x>y", "<!-- open", "<script>never closed"]) parseHtml(s);
	});
	it("survives very deep nesting", () => {
		const deep = `${"<div>".repeat(20_000)}deep${"</div>".repeat(20_000)}`;
		assert.match(md(`<body>${deep}</body>`), /deep/);
	});
});

describe("htmlToMarkdown", () => {
	it("extracts title and renders headings, paragraphs and inline formatting", () => {
		const r = htmlToMarkdown("<html><head><title>T &amp; U</title></head><body><h2>Hi</h2><p>Some <b>bold</b> and <em>em</em> and <code>x()</code>.</p></body></html>");
		assert.equal(r.title, "T & U");
		assert.equal(r.markdown, "## Hi\n\nSome **bold** and *em* and `x()`.");
	});
	it("resolves relative links and drops javascript and fragment links", () => {
		assert.equal(
			md('<p><a href="../api">API</a> <a href="#top">top</a> <a href="javascript:void(0)">js</a> <a href="https://x.org">x</a></p>'),
			"[API](https://example.com/api) top js [x](https://x.org/)",
		);
	});
	it("honours <base href>", () => {
		assert.equal(md('<head><base href="https://cdn.example.org/v2/"></head><p><a href="a">a</a></p>'), "[a](https://cdn.example.org/v2/a)");
	});
	it("drops scripts, styles, nav, footer, forms and hidden elements", () => {
		const out = md(`<body><nav><a href="/">Home</a></nav><script>var x = "<p>no</p>";</script><style>p{}</style>
			<p>Keep me</p><div hidden>secret</div><div style="display:none">gone</div><div role="navigation">menu</div>
			<form><button>Go</button></form><footer>© 2026</footer></body>`);
		assert.equal(out, "Keep me");
	});
	it("prefers <main> over the surrounding page", () => {
		const filler = "word ".repeat(60);
		assert.equal(md(`<body><header><h1>Site</h1></header><div>Sidebar junk</div><main><h1>Article</h1><p>${filler}</p></main></body>`).split("\n")[0], "# Article");
	});
	it("falls back to the longest article when there is no main", () => {
		const long = "text ".repeat(100);
		const out = md(`<body><div>tiny</div><article><p>short</p></article><article><h1>Big</h1><p>${long}</p></article></body>`);
		assert.match(out, /^# Big/);
		assert.doesNotMatch(out, /tiny|short/);
	});
	it("renders lists with implied </li> closes, numbering and nesting", () => {
		assert.equal(md('<ol start="3"><li>three<li>four<ul><li>sub</ul></ol>'), "3. three\n4. four\n\n   - sub");
	});
	it("renders tables with a header separator and escapes pipes", () => {
		assert.equal(
			md("<table><tr><th>Name<th>Note</tr><tr><td>a|b<td>ok</tr><tr><td>only</tr></table>"),
			"| Name | Note |\n| --- | --- |\n| a\\|b | ok |\n| only |  |",
		);
	});
	it("keeps preformatted code verbatim with its language", () => {
		const out = md('<pre><code class="language-ts">const a = 1;\n  if (a &lt; 2) {}\n</code></pre>');
		assert.equal(out, "```ts\nconst a = 1;\n  if (a < 2) {}\n```");
	});
	it("renders blockquotes and images with alt text only", () => {
		assert.equal(md('<blockquote><p>quoted</p></blockquote><img src="/a.png" alt="Chart"><img src="/spacer.gif">'), "> quoted\n\n![Chart](https://example.com/a.png)");
	});
	it("closes an open <p> when a block starts", () => {
		assert.equal(md("<p>one<div>two</div>"), "one\n\ntwo");
	});
	it("keeps blank lines inside code blocks", () => {
		assert.equal(md("<pre>a\n\n\n\nb</pre><p>x</p>"), "```\na\n\n\n\nb\n```\n\nx");
	});
	it("collapses whitespace outside pre", () => {
		assert.equal(md("<p>a\n\n   b\t c</p>"), "a b c");
	});
});

const words = (n: number, w = "lorem") => Array.from({ length: n }, () => w).join(" ");

describe("content picking (shapes seen on Wikipedia, GitHub and blogs)", () => {
	it("narrows <main> to a content-named block holding most of the text", () => {
		const html = `<body><main id="content"><div class="vector-page-titlebar"><ul><li>Deutsch</li><li>Español</li></ul></div>
			<div id="mw-content-text"><p>${words(80, "body")}</p></div></main></body>`;
		const out = md(html);
		assert.ok(out.startsWith("body body"), out.slice(0, 60));
		assert.ok(!out.includes("Deutsch"));
	});
	it("keeps <main> when the article inside is a small part of it", () => {
		const html = `<body><main><p>${words(80, "intro")}</p><article><p>${words(10, "card")}</p></article></main></body>`;
		assert.ok(md(html).startsWith("intro"));
	});
	it("falls back to <body> without main or article", () => {
		assert.equal(md(`<body><div><p>${words(3)}</p></div></body>`), words(3));
	});
});

describe("chrome stripping", () => {
	it("drops menus, share bars and skip links by class, id or text", () => {
		const html = `<body><a href="#main">Skip to content</a><div class="site-menu">Home About</div>
			<div id="share-buttons">Tweet</div><p>${words(40, "real")}</p><span class="sr-only">hidden label</span></body>`;
		const out = md(html);
		for (const junk of ["Skip", "Home", "Tweet", "hidden label"]) assert.ok(!out.includes(junk), junk);
		assert.ok(out.includes("real real"));
	});
	it("keeps a wrapper whose name sounds like chrome when it holds most of the text", () => {
		const html = `<body><div class="content-with-sidebar"><p>${words(40, "kept")}</p></div><p>x</p></body>`;
		assert.ok(md(html).includes("kept kept"));
	});
});

describe("tables", () => {
	it("renders a layout table (nested table or block cells) as blocks, not a grid", () => {
		const html = `<table><tr><td><table><tr><td>inner</td></tr></table></td></tr><tr><td><p>Story one</p></td></tr></table>`;
		const out = md(html);
		assert.ok(!out.includes("---"), out);
		assert.ok(out.includes("inner") && out.includes("Story one"));
	});
	it("drops empty rows from a data table", () => {
		assert.equal(md("<table><tr><th>A</th></tr><tr><td> </td></tr><tr><td>1</td></tr></table>"), "| A |\n| --- |\n| 1 |");
	});
});
