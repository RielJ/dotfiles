/**
 * Stream viewer for plan/review worker windows in `_pi-agents`.
 *
 * The viewer runs under plain `node` (no pi loader), so one test spawns it that
 * way against a finished worker and checks the rendered transcript.
 */
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { after, describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { stripVTControlCharacters as strip } from "node:util";
import {
  NdjsonTail,
  newRenderState,
  pidAlive,
  renderEvent,
  summarizeArgs,
} from "../_stream-viewer.ts";

const VIEWER = fileURLToPath(new URL("../_stream-viewer.ts", import.meta.url));

const delta = (type: string, text: string) => ({
  type: "message_update",
  assistantMessageEvent: { type, contentIndex: 0, delta: text },
});

const EVENTS = [
  { type: "turn_start" },
  delta("thinking_delta", "Let me look"),
  delta("thinking_delta", " at the code."),
  {
    type: "tool_execution_start",
    toolCallId: "c1",
    toolName: "read",
    args: { path: "src/app.ts" },
  },
  {
    type: "tool_execution_end",
    toolCallId: "c1",
    toolName: "read",
    result: { content: [{ type: "text", text: "a\nb\nc" }] },
    isError: false,
  },
  {
    type: "tool_execution_start",
    toolCallId: "c2",
    toolName: "bash",
    args: { command: "npm test\n  --watch" },
  },
  {
    type: "tool_execution_end",
    toolCallId: "c2",
    toolName: "bash",
    result: { content: [{ type: "text", text: "exit 1: boom" }] },
    isError: true,
  },
  delta("text_delta", "## Plan\n"),
  delta("text_delta", "1. Fix it"),
  { type: "agent_end" },
];

function render(events: unknown[]): string {
  const state = newRenderState();
  return strip(events.map((ev) => renderEvent(ev, state)).join(""));
}

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "stream-viewer-test-"));
after(() => fs.rmSync(tmp, { recursive: true, force: true }));

describe("renderEvent", () => {
  it("renders thinking, tool calls, results and text as separate lines", () => {
    assert.equal(
      render(EVENTS),
      [
        "── turn 1 ──",
        "Let me look at the code.",
        "▸ read src/app.ts",
        "  ↳ 3 lines",
        "▸ bash npm test --watch",
        "  ✗ exit 1: boom",
        "## Plan",
        "1. Fix it",
        "",
      ].join("\n"),
    );
  });

  it("ignores unknown events and malformed payloads", () => {
    assert.equal(
      render([{ type: "queue_update" }, null, "x", { type: "message_update" }]),
      "",
    );
  });

  it("summarizes arguments without a known key as compact JSON", () => {
    assert.equal(summarizeArgs({ n: 1 }), '{"n":1}');
    assert.equal(summarizeArgs({}), "");
    assert.equal(summarizeArgs("nope"), "");
    assert.equal(summarizeArgs({ path: "x".repeat(200) }).length, 100);
  });
});

describe("NdjsonTail", () => {
  it("waits for the file, keeps partial lines and multibyte characters, and restarts on rewrite", () => {
    const file = path.join(tmp, "tail.ndjson");
    const tail = new NdjsonTail(file);
    assert.deepEqual(tail.read(), []);

    const line = JSON.stringify({ t: "héllo ✓" });
    const bytes = Buffer.from(`${line}\n${line}`);
    const cut = bytes.indexOf(Buffer.from("✓")) + 1; // split inside the 3-byte "✓"
    fs.writeFileSync(file, bytes.subarray(0, cut));
    assert.deepEqual(tail.read(), []);
    fs.appendFileSync(file, bytes.subarray(cut));
    assert.deepEqual(tail.read(), [line]);
    fs.appendFileSync(file, "\n");
    assert.deepEqual(tail.read(), [line]);

    fs.writeFileSync(file, '{"again":1}\n');
    assert.deepEqual(tail.read(), ['{"again":1}']);
  });
});

describe("pidAlive", () => {
  it("is true for this process and false for an exited one", () => {
    assert.equal(pidAlive(process.pid), true);
    const child = spawnSync(process.execPath, ["-e", "process.pid"]);
    assert.equal(pidAlive(child.pid ?? 0), false);
  });
});

describe("viewer script", () => {
  it("runs under plain node and renders a finished worker's stream", () => {
    const file = path.join(tmp, "worker.ndjson");
    fs.writeFileSync(
      file,
      `${EVENTS.map((ev) => JSON.stringify(ev)).join("\n")}\n`,
    );
    const dead = spawnSync(process.execPath, ["-e", "0"]).pid ?? 0;
    // stdin is not a TTY here, so the viewer lingers on a timer; kill it once output is checked.
    const out = spawnSync(
      process.execPath,
      [VIEWER, file, String(dead), "Opus", "5.5"],
      {
        encoding: "utf8",
        timeout: 5_000,
      },
    );
    const text = strip(out.stdout);
    assert.match(text, /^Opus 5\.5\n/);
    assert.match(text, /▸ read src\/app\.ts/);
    assert.match(text, /1\. Fix it\n/);
    assert.match(text, /■ worker exited\./);
    assert.equal(out.stderr, "");
  });

  it("prints usage and exits 2 on bad arguments", () => {
    const out = spawnSync(process.execPath, [VIEWER, "only-a-file"], {
      encoding: "utf8",
      timeout: 5_000,
    });
    assert.equal(out.status, 2);
    assert.match(out.stderr, /^usage:/);
  });
});
