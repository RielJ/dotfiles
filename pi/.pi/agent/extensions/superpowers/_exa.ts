/**
 * Client for Exa's public MCP endpoint (https://mcp.exa.ai/mcp), which answers without an API key.
 * The idea comes from pi-web-access, which uses it as its keyless default. Two tools are used:
 *   web_search_exa — search, results as `Title:/URL:/Published:/Author:/Highlights:` blocks split by `---`
 *   web_fetch_exa  — a page as markdown; failures come back as `isError: true` with a crawl code
 * Responses arrive as server-sent events (`event: message` / `data: {json}`) or as plain JSON.
 */

export const EXA_MCP = "https://mcp.exa.ai/mcp";

export type FetchFn = typeof fetch;

export interface ExaOptions {
  fetchFn?: FetchFn;
  signal?: AbortSignal;
  timeoutMs?: number;
}

export interface ExaSearchResult {
  title: string;
  url: string;
  snippet: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

/** A JSON-RPC reply to tools/call: the tool's text (which may itself report an error) or a protocol error. */
export type McpReply =
  | { kind: "result"; text: string; isError: boolean }
  | { kind: "error"; message: string };

function toReply(msg: unknown): McpReply | null {
  if (!isRecord(msg)) return null;
  if (isRecord(msg.error))
    return { kind: "error", message: String(msg.error.message ?? "unknown") };
  const result = msg.result;
  if (!isRecord(result) || !Array.isArray(result.content)) return null;
  const text = result.content
    .map((c: unknown) =>
      isRecord(c) && c.type === "text" && typeof c.text === "string"
        ? c.text
        : "",
    )
    .join("\n");
  return { kind: "result", text, isError: result.isError === true };
}

/** Parses an SSE stream (`data: {json}` lines) or a plain JSON body into a reply. Throws if neither holds one. */
export function parseMcpBody(body: string): McpReply {
  const dataLines = body
    .split("\n")
    .filter((l) => l.startsWith("data:"))
    .map((l) => l.slice(5).trim());
  for (const c of dataLines.length > 0 ? dataLines : [body.trim()]) {
    let reply: McpReply | null = null;
    try {
      reply = toReply(JSON.parse(c));
    } catch {
      reply = null; // not JSON; try the next data line
    }
    if (reply) return reply;
  }
  throw new Error(
    `Exa returned no JSON-RPC reply: ${body.replace(/\s+/g, " ").slice(0, 200)}`,
  );
}

/** Returns the tool's text, or throws with Exa's own error text. */
export function toolText(reply: McpReply): string {
  if (reply.kind === "error") throw new Error(`Exa error: ${reply.message}`);
  if (reply.isError)
    throw new Error(`Exa: ${reply.text.replace(/\s+/g, " ").slice(0, 300)}`);
  return reply.text;
}

async function callTool(
  name: string,
  args: Record<string, unknown>,
  opts: ExaOptions,
): Promise<string> {
  const timeout = AbortSignal.timeout(opts.timeoutMs ?? 20_000);
  const resp = await (opts.fetchFn ?? fetch)(EXA_MCP, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json, text/event-stream",
    },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "tools/call",
      params: { name, arguments: args },
    }),
    signal: opts.signal ? AbortSignal.any([opts.signal, timeout]) : timeout,
  });
  const body = await resp.text();
  if (!resp.ok)
    throw new Error(
      `Exa HTTP ${resp.status}: ${body.replace(/\s+/g, " ").slice(0, 200)}`,
    );
  return toolText(parseMcpBody(body));
}

/** Parses web_search_exa text into results. The snippet is the start of the highlights. */
export function parseExaSearch(text: string): ExaSearchResult[] {
  const results: ExaSearchResult[] = [];
  for (const block of text.split(/\n---\n/)) {
    const title = block.match(/^Title:\s*(.*)$/m)?.[1]?.trim();
    const url = block.match(/^URL:\s*(\S+)/m)?.[1];
    if (!url) continue;
    const highlights = block.split(/^Highlights:\s*$/m)[1] ?? "";
    const snippet = highlights
      .replace(/^#+\s*/gm, "")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 300);
    results.push({ title: title || url, url, snippet });
  }
  return results;
}

export async function exaSearch(
  query: string,
  numResults: number,
  opts: ExaOptions = {},
): Promise<ExaSearchResult[]> {
  return parseExaSearch(
    await callTool("web_search_exa", { query, numResults }, opts),
  );
}

/** Reads one page through Exa as markdown. Throws on crawl errors (CRAWL_NOT_FOUND and so on). */
export async function exaFetch(
  url: string,
  maxCharacters: number,
  opts: ExaOptions = {},
): Promise<string> {
  return callTool("web_fetch_exa", { urls: [url], maxCharacters }, opts);
}
