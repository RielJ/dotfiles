/**
 * Live view of one plan/review worker, run inside its `_pi-agents` tmux window.
 *
 *   node _stream-viewer.ts <ndjson-log> <worker-pid> <label...>
 *
 * The worker is a headless `pi --mode json` child of the parent session; its
 * stdout is teed to <ndjson-log>. This script tails that file and renders text,
 * thinking, and tool calls. It only watches: closing the window never touches
 * the worker. When the worker exits it waits for `q` (or 10 minutes), then
 * exits, which closes the window.
 *
 * Plain `node` runs this file directly (type stripping), so it may only import
 * `node:` modules and use erasable TypeScript syntax.
 */
import { closeSync, existsSync, openSync, readSync, statSync } from "node:fs";
import { StringDecoder } from "node:string_decoder";

const DIM = "\x1b[2m";
const ITALIC = "\x1b[3m";
const BOLD = "\x1b[1m";
const CYAN = "\x1b[36m";
const RED = "\x1b[31m";
const GREEN = "\x1b[32m";
const RESET = "\x1b[0m";

const POLL_MS = 250;
const LINGER_MS = 10 * 60_000;

export interface RenderState {
  /** Block currently being streamed; a newline closes it before other output. */
  block: "none" | "text" | "thinking";
  turn: number;
}

export function newRenderState(): RenderState {
  return { block: "none", turn: 0 };
}

type Json = Record<string, unknown>;

const isObj = (v: unknown): v is Json => typeof v === "object" && v !== null;
const str = (v: unknown): string => (typeof v === "string" ? v : "");

function oneLine(s: string, max: number): string {
  const flat = s.replace(/\s+/g, " ").trim();
  return flat.length > max ? `${flat.slice(0, max - 1)}…` : flat;
}

/** Short, single-line description of a tool call's arguments. */
export function summarizeArgs(args: unknown): string {
  if (!isObj(args)) return "";
  const pick =
    str(args.path) ||
    str(args.command) ||
    str(args.pattern) ||
    str(args.query) ||
    str(args.url);
  if (pick) return oneLine(pick, 100);
  const json = JSON.stringify(args);
  return json === "{}" ? "" : oneLine(json, 100);
}

function resultText(result: unknown): string {
  if (!isObj(result) || !Array.isArray(result.content)) return "";
  return result.content
    .map((part) => (isObj(part) ? str(part.text) : ""))
    .join("\n");
}

function closeBlock(state: RenderState): string {
  if (state.block === "none") return "";
  const out = state.block === "thinking" ? `${RESET}\n` : "\n";
  state.block = "none";
  return out;
}

function openBlock(state: RenderState, block: "text" | "thinking"): string {
  if (state.block === block) return "";
  const prefix = closeBlock(state);
  state.block = block;
  return block === "thinking" ? `${prefix}${DIM}${ITALIC}` : prefix;
}

/** Render one `pi --mode json` event as terminal output. Unknown events render as "". */
export function renderEvent(ev: unknown, state: RenderState): string {
  if (!isObj(ev)) return "";
  switch (ev.type) {
    case "turn_start":
      state.turn++;
      return `${closeBlock(state)}${DIM}── turn ${state.turn} ──${RESET}\n`;
    case "message_update": {
      const ae = ev.assistantMessageEvent;
      if (!isObj(ae)) return "";
      if (ae.type === "text_delta")
        return openBlock(state, "text") + str(ae.delta);
      if (ae.type === "thinking_delta")
        return openBlock(state, "thinking") + str(ae.delta);
      return "";
    }
    case "tool_execution_start": {
      const name = str(ev.toolName) || "tool";
      const args = summarizeArgs(ev.args);
      return `${closeBlock(state)}${CYAN}▸ ${name}${RESET}${args ? ` ${args}` : ""}\n`;
    }
    case "tool_execution_end": {
      const text = resultText(ev.result);
      if (ev.isError === true) {
        return `${closeBlock(state)}${RED}  ✗ ${oneLine(text || "error", 160)}${RESET}\n`;
      }
      const lines = text ? text.split("\n").length : 0;
      return `${closeBlock(state)}${DIM}  ↳ ${lines} line${lines === 1 ? "" : "s"}${RESET}\n`;
    }
    case "agent_end":
      return closeBlock(state);
    default:
      return "";
  }
}

/** Incrementally reads new NDJSON lines from a file that may not exist yet or may be rewritten. */
export class NdjsonTail {
  private readonly file: string;
  private offset = 0;
  private pending = "";
  private decoder = new StringDecoder("utf8");

  constructor(file: string) {
    this.file = file;
  }

  /** Complete lines appended since the last call. */
  read(): string[] {
    if (!existsSync(this.file)) return [];
    const size = statSync(this.file).size;
    if (size < this.offset) {
      // Rewritten from the start (a re-run of the same worker).
      this.offset = 0;
      this.pending = "";
      this.decoder = new StringDecoder("utf8");
    }
    if (size === this.offset) return [];
    const buf = Buffer.alloc(size - this.offset);
    const fd = openSync(this.file, "r");
    try {
      readSync(fd, buf, 0, buf.length, this.offset);
    } finally {
      closeSync(fd);
    }
    this.offset = size;
    this.pending += this.decoder.write(buf);
    const lines = this.pending.split("\n");
    this.pending = lines.pop() ?? "";
    return lines.filter((line) => line.trim());
  }
}

export function pidAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (err) {
    // EPERM: the process exists but belongs to someone else.
    return isObj(err) && err.code === "EPERM";
  }
}

function renderLines(lines: string[], state: RenderState): string {
  let out = "";
  for (const line of lines) {
    try {
      out += renderEvent(JSON.parse(line), state);
    } catch {
      // Not a JSON event line; pi only writes events to stdout, so skip it.
    }
  }
  return out;
}

const sleep = (ms: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, ms));

function waitForQuit(ms: number): Promise<void> {
  return new Promise((resolve) => {
    const finish = () => {
      clearTimeout(timer);
      if (process.stdin.isTTY) process.stdin.setRawMode(false);
      process.stdin.pause();
      resolve();
    };
    const timer = setTimeout(finish, ms);
    if (!process.stdin.isTTY) return;
    process.stdin.setRawMode(true);
    process.stdin.resume();
    process.stdin.on("data", (data) => {
      const key = data.toString();
      if (key === "q" || key === "\x03" || key === "\x1b") finish();
    });
  });
}

export async function runViewer(argv: string[]): Promise<void> {
  const [file, pidArg, ...labelParts] = argv;
  const pid = Number(pidArg);
  if (!file || !Number.isInteger(pid) || pid <= 0) {
    process.stderr.write(
      "usage: node _stream-viewer.ts <ndjson-log> <worker-pid> <label...>\n",
    );
    process.exitCode = 2;
    return;
  }
  const label = labelParts.join(" ") || "worker";
  process.stdout.write(`${BOLD}${label}${RESET}\n${DIM}${file}${RESET}\n\n`);

  const tail = new NdjsonTail(file);
  const state = newRenderState();
  const flush = () => {
    const out = renderLines(tail.read(), state);
    if (out) process.stdout.write(out);
  };
  while (pidAlive(pid)) {
    flush();
    await sleep(POLL_MS);
  }
  flush();
  process.stdout.write(
    `${closeBlock(state)}\n${GREEN}■ worker exited.${RESET} ${DIM}Press q to close; the window closes by itself in 10 minutes.${RESET}\n`,
  );
  await waitForQuit(LINGER_MS);
}

if (import.meta.main) void runViewer(process.argv.slice(2));
