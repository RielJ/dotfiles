/**
 * HTML to markdown for web_read, with no dependencies and no DOM.
 *
 * A small tokenizer builds a forgiving element tree (implied closes for p, li, td and
 * friends; stray end tags ignored), then a renderer turns it into markdown. The rendering
 * rules follow Obscura's LP.getMarkdown walker. On top of that it keeps only the main
 * content: the <main> element, else the longest <article>, else <body>, with navigation,
 * forms, scripts and other page chrome removed.
 */

interface ElementNode {
  tag: string;
  attrs: Record<string, string>;
  children: Node[];
  parent: ElementNode | null;
}
type Node = ElementNode | string;

const VOID = new Set([
  "area",
  "base",
  "br",
  "col",
  "embed",
  "hr",
  "img",
  "input",
  "link",
  "meta",
  "param",
  "source",
  "track",
  "wbr",
]);
const RAW_TEXT = new Set([
  "script",
  "style",
  "textarea",
  "title",
  "noscript",
  "template",
  "svg",
  "math",
  "iframe",
]);
/** Elements whose content is page chrome, not the page's text. */
const DROP = new Set([
  "script",
  "style",
  "noscript",
  "template",
  "svg",
  "math",
  "iframe",
  "canvas",
  "nav",
  "footer",
  "aside",
  "form",
  "button",
  "select",
  "textarea",
  "input",
  "dialog",
  "head",
  "link",
  "meta",
  "object",
  "embed",
]);
const BLOCK = new Set([
  "address",
  "article",
  "aside",
  "blockquote",
  "dd",
  "details",
  "dialog",
  "div",
  "dl",
  "dt",
  "fieldset",
  "figcaption",
  "figure",
  "footer",
  "form",
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "header",
  "hr",
  "li",
  "main",
  "nav",
  "ol",
  "p",
  "pre",
  "section",
  "summary",
  "table",
  "ul",
]);
/** Opening the key tag closes an open element in the set, searching up to (not past) a boundary tag. */
const IMPLIED_CLOSE: Record<
  string,
  { closes: Set<string>; boundary: Set<string> }
> = {
  li: { closes: new Set(["li"]), boundary: new Set(["ul", "ol", "menu"]) },
  dt: { closes: new Set(["dt", "dd"]), boundary: new Set(["dl"]) },
  dd: { closes: new Set(["dt", "dd"]), boundary: new Set(["dl"]) },
  tr: {
    closes: new Set(["tr", "td", "th"]),
    boundary: new Set(["table", "thead", "tbody", "tfoot"]),
  },
  td: { closes: new Set(["td", "th"]), boundary: new Set(["tr", "table"]) },
  th: { closes: new Set(["td", "th"]), boundary: new Set(["tr", "table"]) },
  option: {
    closes: new Set(["option"]),
    boundary: new Set(["select", "datalist"]),
  },
};
const MAX_DEPTH = 400;

const NAMED: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
  ensp: " ",
  emsp: " ",
  thinsp: " ",
  shy: "",
  mdash: "—",
  ndash: "–",
  hellip: "…",
  lsquo: "‘",
  rsquo: "’",
  sbquo: "‚",
  ldquo: "“",
  rdquo: "”",
  bdquo: "„",
  laquo: "«",
  raquo: "»",
  middot: "·",
  bull: "•",
  copy: "©",
  reg: "®",
  trade: "™",
  times: "×",
  divide: "÷",
  deg: "°",
  plusmn: "±",
  para: "¶",
  sect: "§",
  euro: "€",
  pound: "£",
  yen: "¥",
  cent: "¢",
  larr: "←",
  rarr: "→",
  uarr: "↑",
  darr: "↓",
  harr: "↔",
  hearts: "♥",
  check: "✓",
  zwj: "",
  zwnj: "",
  lrm: "",
  rlm: "",
};

export function decodeEntities(s: string): string {
  return s.replace(
    /&(#[xX][0-9a-fA-F]+|#\d+|[a-zA-Z][a-zA-Z0-9]*);?/g,
    (whole, name: string) => {
      if (name[0] === "#") {
        const code =
          name[1] === "x" || name[1] === "X"
            ? Number.parseInt(name.slice(2), 16)
            : Number.parseInt(name.slice(1), 10);
        return code > 0 && code <= 0x10ffff
          ? String.fromCodePoint(code)
          : whole;
      }
      return NAMED[name] ?? NAMED[name.toLowerCase()] ?? whole;
    },
  );
}

function parseAttrs(source: string): Record<string, string> {
  const attrs: Record<string, string> = {};
  for (const m of source.matchAll(
    /([^\s=/>"']+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?/g,
  )) {
    attrs[m[1].toLowerCase()] = decodeEntities(m[2] ?? m[3] ?? m[4] ?? "");
  }
  return attrs;
}

/** Builds an element tree from HTML. Never throws; malformed markup degrades to text. */
export function parseHtml(html: string): ElementNode {
  const root: ElementNode = {
    tag: "#root",
    attrs: {},
    children: [],
    parent: null,
  };
  let current = root;
  let depth = 0;
  const tagRe =
    /<!--[\s\S]*?(?:-->|$)|<!\[CDATA\[[\s\S]*?(?:\]\]>|$)|<[!?][^>]*>|<(\/?)([a-zA-Z][a-zA-Z0-9:-]*)((?:[^>"']|"[^"]*"|'[^']*')*)>/g;
  let last = 0;
  const close = (tag: string): boolean => {
    for (let n: ElementNode | null = current; n && n !== root; n = n.parent) {
      if (n.tag === tag) {
        for (let c: ElementNode | null = current; c && c !== n; c = c.parent)
          depth--;
        current = n.parent ?? root;
        depth--;
        return true;
      }
    }
    return false;
  };
  for (let m = tagRe.exec(html); m; m = tagRe.exec(html)) {
    if (m.index > last) current.children.push(html.slice(last, m.index));
    last = tagRe.lastIndex;
    const name = m[2]?.toLowerCase();
    if (!name) continue; // comment, doctype, CDATA, processing instruction
    if (m[1]) {
      close(name);
      continue;
    }
    const implied = IMPLIED_CLOSE[name];
    if (implied) {
      for (
        let n: ElementNode | null = current;
        n && n !== root && !implied.boundary.has(n.tag);
        n = n.parent
      ) {
        if (implied.closes.has(n.tag)) {
          close(n.tag);
          break;
        }
      }
    }
    // A block element closes an open <p>, looking up through inline elements only.
    if (BLOCK.has(name)) {
      for (let n: ElementNode | null = current; n && n !== root; n = n.parent) {
        if (n.tag === "p") {
          close("p");
          break;
        }
        if (BLOCK.has(n.tag)) break;
      }
    }
    const el: ElementNode = {
      tag: name,
      attrs: parseAttrs(m[3] ?? ""),
      children: [],
      parent: current,
    };
    current.children.push(el);
    if (RAW_TEXT.has(name)) {
      const end = html.toLowerCase().indexOf(`</${name}`, last);
      const stop = end === -1 ? html.length : end;
      el.children.push(html.slice(last, stop));
      const gt = end === -1 ? -1 : html.indexOf(">", end);
      last = gt === -1 ? html.length : gt + 1;
      tagRe.lastIndex = last;
      continue;
    }
    if (VOID.has(name) || m[3]?.trimEnd().endsWith("/")) continue;
    if (depth < MAX_DEPTH) {
      current = el;
      depth++;
    }
  }
  if (last < html.length) current.children.push(html.slice(last));
  return root;
}

function find(
  node: ElementNode,
  test: (el: ElementNode) => boolean,
  out: ElementNode[] = [],
): ElementNode[] {
  const stack: ElementNode[] = [node];
  while (stack.length) {
    const el = stack.pop();
    if (!el) break;
    if (test(el)) out.push(el);
    for (let i = el.children.length - 1; i >= 0; i--) {
      const c = el.children[i];
      if (typeof c !== "string") stack.push(c);
    }
  }
  return out;
}

const textLengths = new WeakMap<ElementNode, number>();
/** Visible characters under a node, ignoring whitespace. Memoized: content picking asks repeatedly. */
function textLength(node: Node): number {
  if (typeof node === "string") return node.replace(/\s+/g, "").length;
  if (DROP.has(node.tag)) return 0;
  const cached = textLengths.get(node);
  if (cached !== undefined) return cached;
  let n = 0;
  for (const c of node.children) n += textLength(c);
  textLengths.set(node, n);
  return n;
}

function isHidden(el: ElementNode): boolean {
  return (
    "hidden" in el.attrs ||
    el.attrs["aria-hidden"] === "true" ||
    /display\s*:\s*none|visibility\s*:\s*hidden/i.test(el.attrs.style ?? "") ||
    /^(navigation|banner|contentinfo|complementary|search|dialog|menu|menubar)$/.test(
      el.attrs.role ?? "",
    )
  );
}

interface RenderContext {
  base: URL | null;
  inPre: boolean;
  /** Page chrome found by class, id or link text inside the content root. */
  skip: ReadonlySet<ElementNode>;
}

/** class/id words that mark page chrome: menus, sidebars, share bars, cookie banners, screen-reader links. */
const CHROME_WORDS =
  /(?:^|[\s_-])(?:nav|navbar|navigation|menu|sidebar|breadcrumbs?|footer|cookies?|consent|share|sharing|social|related|comments?|advert|ads|promo|newsletter|subscribe|toolbar|skip-link|sr-only|screen-reader-text|visually-hidden|interlanguage|catlinks|navbox|mw-editsection|mw-jump-link|vector-menu|toc)(?:$|[\s_-])/i;
/** class/id values that usually wrap a page's main text, most specific first. */
const CONTENT_ID =
  /^(?:mw-content-text|markdown-body|article-body|post-content|entry-content|readme|main-content|content)$/i;

function isContentCandidate(el: ElementNode): boolean {
  if (el.tag === "article") return true;
  return [el.attrs.id ?? "", ...(el.attrs.class ?? "").split(/\s+/)].some((v) =>
    CONTENT_ID.test(v),
  );
}

/**
 * Collects chrome inside `root`: elements whose class or id names a menu, sidebar and so on, and
 * "Skip to content" links. A match that holds half the root's text or more is a layout wrapper with
 * a misleading name (say `content-with-sidebar`), so it stays.
 */
function collectChrome(root: ElementNode): Set<ElementNode> {
  const half = textLength(root) / 2;
  const out = new Set<ElementNode>();
  const walk = (el: ElementNode) => {
    for (const c of el.children) {
      if (typeof c === "string") continue;
      const names = `${c.attrs.id ?? ""} ${c.attrs.class ?? ""}`;
      const skipLink =
        c.tag === "a" &&
        (c.attrs.href ?? "").startsWith("#") &&
        /^\s*(skip|jump) to\b/i.test(
          c.children.filter((x) => typeof x === "string").join(""),
        );
      if (skipLink || (CHROME_WORDS.test(names) && textLength(c) < half))
        out.add(c);
      else walk(c);
    }
  };
  walk(root);
  return out;
}

/**
 * Picks the element holding the page's text: <main> (or role=main), else <body>; then narrows to
 * an <article> or a content-named element (#mw-content-text, .markdown-body, #content, ...) while
 * that keeps at least half the text.
 */
function pickContent(body: ElementNode): ElementNode {
  let root =
    find(body, (n) => n.tag === "main" || n.attrs.role === "main").find(
      (n) => textLength(n) > 200,
    ) ?? body;
  for (let depth = 0; depth < 4; depth++) {
    const total = textLength(root);
    const best = find(root, (n) => n !== root && isContentCandidate(n))
      .map((n) => ({ n, len: textLength(n) }))
      .sort((a, b) => b.len - a.len)[0];
    if (!best || best.len < total * 0.5) break;
    root = best.n;
  }
  return root;
}

function resolveHref(href: string, ctx: RenderContext): string | null {
  const h = href.trim();
  if (!h || h.startsWith("#") || /^(javascript|data|mailto|tel):/i.test(h))
    return null;
  if (!ctx.base) return h;
  try {
    return new URL(h, ctx.base).href;
  } catch {
    return h;
  }
}

function renderChildren(el: ElementNode, ctx: RenderContext): string {
  let out = "";
  for (const c of el.children) out += render(c, ctx);
  return out;
}

const TABLE_BLOCKS = new Set([
  "table",
  "p",
  "div",
  "ul",
  "ol",
  "dl",
  "pre",
  "blockquote",
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
]);

/**
 * A table used for page layout rather than data: marked presentational, or with a nested table
 * or block elements (paragraphs, lists, headings) in its cells. Hacker News and Wikipedia
 * infoboxes are built this way, and a markdown grid would crush them into one line per row.
 */
function isLayoutTable(el: ElementNode): boolean {
  if (/^(presentation|none)$/.test(el.attrs.role ?? "")) return true;
  return find(el, (n) => n !== el && TABLE_BLOCKS.has(n.tag)).length > 0;
}

function renderTable(el: ElementNode, ctx: RenderContext): string {
  if (isLayoutTable(el)) {
    const cells = find(el, (n) => n.tag === "td" || n.tag === "th").filter(
      (c) => {
        for (let p = c.parent; p && p !== el; p = p.parent)
          if (p.tag === "table") return false; // nested table renders itself
        return true;
      },
    );
    return `\n\n${cells
      .map((c) => renderChildren(c, ctx).trim())
      .filter(Boolean)
      .join("\n\n")}\n\n`;
  }
  const lines = find(el, (n) => n.tag === "tr")
    .map((tr) => {
      const cells = tr.children.filter(
        (c): c is ElementNode =>
          typeof c !== "string" && (c.tag === "td" || c.tag === "th"),
      );
      return cells.map((c) =>
        renderChildren(c, ctx)
          .replace(/\s+/g, " ")
          .replace(/\|/g, "\\|")
          .trim(),
      );
    })
    .filter((cells) => cells.some(Boolean));
  if (lines.length === 0) return "";
  // One row has no header/body split; a grid with only a header row is noise.
  if (lines.length === 1)
    return `\n\n${lines[0].filter(Boolean).join(" ").replace(/\\\|/g, "|")}\n\n`;
  const width = Math.max(...lines.map((l) => l.length));
  const row = (cells: string[]) =>
    `| ${[...cells, ...Array<string>(width - cells.length).fill("")].join(" | ")} |`;
  const [head, ...body] = lines;
  return `\n\n${[row(head), row(Array<string>(width).fill("---")), ...body.map(row)].join("\n")}\n\n`;
}

function render(node: Node, ctx: RenderContext): string {
  if (typeof node === "string") {
    const text = decodeEntities(node);
    return ctx.inPre ? text : text.replace(/\s+/g, " ");
  }
  const { tag } = node;
  if (DROP.has(tag) || isHidden(node) || ctx.skip.has(node)) return "";
  switch (tag) {
    case "h1":
    case "h2":
    case "h3":
    case "h4":
    case "h5":
    case "h6": {
      const text = renderChildren(node, ctx).replace(/\s+/g, " ").trim();
      return text ? `\n\n${"#".repeat(Number(tag[1]))} ${text}\n\n` : "";
    }
    case "p":
      return `\n\n${renderChildren(node, ctx).trim()}\n\n`;
    case "br":
      return ctx.inPre ? "\n" : "  \n";
    case "hr":
      return "\n\n---\n\n";
    case "strong":
    case "b": {
      const t = renderChildren(node, ctx);
      return t.trim() ? `**${t.trim()}**` : t;
    }
    case "em":
    case "i": {
      const t = renderChildren(node, ctx);
      return t.trim() ? `*${t.trim()}*` : t;
    }
    case "code": {
      const t = renderChildren(node, ctx);
      return ctx.inPre ? t : t.trim() ? `\`${t.trim()}\`` : "";
    }
    case "pre": {
      const t = renderChildren(node, { ...ctx, inPre: true }).replace(
        /^\n+|\s+$/g,
        "",
      );
      const lang =
        (
          find(node, (n) => n.tag === "code")[0]?.attrs.class ??
          node.attrs.class ??
          ""
        ).match(/(?:language|lang)-([\w+#-]+)/)?.[1] ?? "";
      const fence = t.includes("```") ? "````" : "```";
      return `\n\n${fence}${lang}\n${t}\n${fence}\n\n`;
    }
    case "blockquote": {
      const t = renderChildren(node, ctx)
        .replace(/\n{3,}/g, "\n\n")
        .trim();
      return t ? `\n\n${t.replace(/^/gm, "> ")}\n\n` : "";
    }
    case "a": {
      const t = renderChildren(node, ctx).replace(/\s+/g, " ").trim();
      const href = resolveHref(node.attrs.href ?? "", ctx);
      return href && t ? `[${t}](${href})` : t;
    }
    case "img": {
      const alt = (node.attrs.alt ?? "").trim();
      const src = resolveHref(node.attrs.src ?? "", ctx);
      return alt && src ? `![${alt}](${src})` : "";
    }
    case "ul":
    case "ol": {
      let n = Number.parseInt(node.attrs.start ?? "1", 10) || 1;
      const items = node.children.map((c) => {
        if (typeof c === "string") return c.trim() ? render(c, ctx) : "";
        if (c.tag !== "li") return render(c, ctx);
        if (DROP.has(c.tag) || isHidden(c) || ctx.skip.has(c)) return "";
        const body = renderChildren(c, ctx)
          .replace(/\n{3,}/g, "\n\n")
          .trim();
        const bullet = tag === "ol" ? `${n++}. ` : "- ";
        return `${bullet}${body.replace(/\n/g, `\n${" ".repeat(bullet.length)}`)}\n`;
      });
      return `\n\n${items.join("")}\n`;
    }
    case "li":
      return `\n- ${renderChildren(node, ctx).trim()}\n`;
    case "dt":
      return `\n\n**${renderChildren(node, ctx).trim()}**\n`;
    case "dd":
      return `\n${renderChildren(node, ctx).trim()}\n`;
    case "table":
      return renderTable(node, ctx);
    default:
      return BLOCK.has(tag) || tag === "body" || tag === "html"
        ? `\n${renderChildren(node, ctx)}\n`
        : renderChildren(node, ctx);
  }
}

/** Trims stray spaces left by collapsed whitespace and squeezes blank lines, leaving fenced code untouched. */
function tidy(md: string): string {
  const out: string[] = [];
  let fence = "";
  let blank = 0;
  for (const line of md.split("\n")) {
    const marker = line.match(/^(`{3,})/)?.[1];
    if (fence) {
      out.push(line);
      if (marker === fence && line.trim() === fence) fence = "";
      continue;
    }
    if (marker) fence = marker;
    const l = line
      .replace(/[ \t]+$/g, (s) => (s === "  " ? s : ""))
      .replace(/^ +(?=\S)(?![-*>|]|\d+\.)/, "");
    blank = l.trim() ? 0 : blank + 1;
    if (blank < 2) out.push(l.trim() ? l : "");
  }
  return out.join("\n").trim();
}

export interface PageMarkdown {
  title: string;
  markdown: string;
}

/** Converts an HTML page to markdown, keeping only its main content. `url` resolves relative links. */
export function htmlToMarkdown(html: string, url?: string): PageMarkdown {
  const root = parseHtml(html);
  const titleEl = find(root, (n) => n.tag === "title")[0];
  const title = titleEl
    ? decodeEntities(titleEl.children.join("")).replace(/\s+/g, " ").trim()
    : "";
  let base: URL | null = null;
  try {
    const baseHref = find(root, (n) => n.tag === "base" && !!n.attrs.href)[0]
      ?.attrs.href;
    base = url ? new URL(baseHref ?? "", url) : null;
  } catch {
    base = null;
  }
  const body = find(root, (n) => n.tag === "body")[0] ?? root;
  const content = pickContent(body);
  const ctx: RenderContext = {
    base,
    inPre: false,
    skip: collectChrome(content),
  };
  // Drop the site header around the content, but keep a header inside an article (it holds the headline).
  const markdown = tidy(
    content === body
      ? body.children
          .map((c) =>
            typeof c !== "string" && c.tag === "header" ? "" : render(c, ctx),
          )
          .join("")
      : render(content, ctx),
  );
  return { title, markdown };
}
