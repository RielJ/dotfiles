/**
 * Planner/reviewer time limits and result settling.
 *
 * Regression: run 20261109-174615-plan. Opus planners stream one long `write`
 * call for 5+ minutes; a 6-minute wall clock killed Plan D mid-write (no plan)
 * and marked Plan A failed one second after it had written a complete plan.
 */
import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { after, before, describe, it } from "node:test";

// _shared.ts imports siblings as "./x.js"; register the .ts resolver before loading it.
await import("./_resolve-ts.ts");
const { runAgent } = await import("../_shared.ts");
const { settleOutput } = await import("../multirun.ts");

// A fake `pi` on PATH. FAKE_PI_MODE picks its behaviour:
//   stream:<ms>  emit a delta every 50 ms for <ms>, then a final message, exit 0
//   hang         emit one event, then go silent forever
//   endless      emit a delta every 50 ms forever
const FAKE_PI = `#!/usr/bin/env node
const mode = process.env.FAKE_PI_MODE || "";
const ev = (o) => process.stdout.write(JSON.stringify(o) + "\\n");
const delta = () => ev({ type: "message_update", assistantMessageEvent: { type: "thinking_delta", delta: "." } });
process.on("SIGTERM", () => process.exit(143));
// Safety net: never outlive the test run, even if runAgent fails to kill us.
setTimeout(() => process.exit(99), 15000).unref();
if (mode.startsWith("stream:")) {
  const total = Number(mode.slice(7));
  const t = setInterval(delta, 50);
  setTimeout(() => {
    clearInterval(t);
    ev({ type: "message_end", message: { role: "assistant", content: [{ type: "text", text: "PLAN DONE" }] } });
    process.exit(0);
  }, total);
} else if (mode === "hang") {
  delta();
  setInterval(() => {}, 1 << 30);
} else if (mode === "endless") {
  setInterval(delta, 50);
}
`;

// Every test must finish well inside this; a hang fails the test instead of blocking the run.
const TEST_TIMEOUT = { timeout: 15_000 };

let binDir: string;
let oldPath: string | undefined;
let oldMode: string | undefined;

before(() => {
  binDir = fs.mkdtempSync(path.join(os.tmpdir(), "fake-pi-"));
  const bin = path.join(binDir, "pi");
  fs.writeFileSync(bin, FAKE_PI, { mode: 0o755 });
  oldPath = process.env.PATH;
  oldMode = process.env.FAKE_PI_MODE;
  process.env.PATH = `${binDir}${path.delimiter}${oldPath}`;
});

after(() => {
  process.env.PATH = oldPath;
  if (oldMode === undefined) delete process.env.FAKE_PI_MODE;
  else process.env.FAKE_PI_MODE = oldMode;
  fs.rmSync(binDir, { recursive: true, force: true });
});

function run(
  mode: string,
  limits: { timeoutMs: number; idleTimeoutMs?: number },
) {
  process.env.FAKE_PI_MODE = mode;
  return runAgent({
    cwd: os.tmpdir(),
    model: "fake/model",
    systemPrompt: "x",
    tools: "read",
    task: "t",
    extensions: [],
    ...limits,
  });
}

describe("runAgent limits", TEST_TIMEOUT, () => {
  it(
    "keeps a slow but streaming agent alive past the idle limit",
    TEST_TIMEOUT,
    async () => {
      // Streams for 2.5 s; a 1 s idle limit would kill it if it ignored activity.
      // (1 s leaves room for the fake's Node startup before its first event.)
      const r = await run("stream:2500", {
        timeoutMs: 10_000,
        idleTimeoutMs: 1_000,
      });
      assert.equal(r.timedOut, undefined);
      assert.equal(r.exitCode, 0);
      assert.equal(r.output, "PLAN DONE");
    },
  );

  it("kills an agent that goes silent, and says so", TEST_TIMEOUT, async () => {
    const start = Date.now();
    const r = await run("hang", { timeoutMs: 10_000, idleTimeoutMs: 1_000 });
    assert.equal(r.timedOut, "idle");
    assert.ok(
      Date.now() - start < 5_000,
      "idle kill should not wait for the hard cap",
    );
  });

  it(
    "enforces the hard cap even while the agent streams",
    TEST_TIMEOUT,
    async () => {
      const r = await run("endless", {
        timeoutMs: 2_500,
        idleTimeoutMs: 1_000,
      });
      assert.equal(r.timedOut, "hard");
    },
  );
});

describe("settleOutput", () => {
  let dir: string;
  before(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), "settle-"));
  });
  after(() => fs.rmSync(dir, { recursive: true, force: true }));

  it("counts a written file as done even when the process was killed (Plan A case)", () => {
    const file = path.join(dir, "a.md");
    fs.writeFileSync(file, "# full plan");
    const s = settleOutput(file, { output: "", exitCode: 1, timedOut: "hard" });
    assert.equal(s.status, "done");
    assert.equal(s.output, "# full plan");
  });

  it("rejects truncated stdout after a kill, keeps it on disk, and names the cause (Plan D case)", () => {
    const file = path.join(dir, "d.md");
    const s = settleOutput(
      file,
      { output: "Writing the plan now.", exitCode: 1, timedOut: "hard" },
      { timeoutMs: 360_000 },
    );
    assert.equal(s.status, "error");
    assert.equal(s.failure, "killed: hit the 6 min cap");
    assert.equal(fs.readFileSync(file, "utf-8"), "Writing the plan now.");
  });

  it("accepts stdout on a clean exit when no file was written", () => {
    const file = path.join(dir, "b.md");
    const s = settleOutput(file, { output: "plan via stdout", exitCode: 0 });
    assert.equal(s.status, "done");
    assert.equal(fs.readFileSync(file, "utf-8"), "plan via stdout");
  });

  it("reports an idle kill with its limit", () => {
    const s = settleOutput(
      path.join(dir, "c.md"),
      { output: "", exitCode: 1, timedOut: "idle" },
      { timeoutMs: 1, idleTimeoutMs: 240_000 },
    );
    assert.equal(s.failure, "killed: no output for 240s");
  });
});
