import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { homedir } from "node:os";
import { after, before, describe, it } from "node:test";
import {
  createBashToolDefinition,
  createLsToolDefinition,
  createReadToolDefinition,
} from "@earendil-works/pi-coding-agent";
import {
  createContainerBashOps,
  createContainerLsOps,
  createContainerReadOps,
  sandboxTool,
  sanitizeUntrusted,
} from "../child-extensions/container-tools.ts";
import { createSandbox, destroySandbox, docker, type Sandbox, SANDBOX_USER } from "../container-isolation.ts";

describe("sanitizeUntrusted", () => {
  it("makes terminal escapes, bidi overrides, and zero-width characters visible", () => {
    assert.equal(sanitizeUntrusted("a\u001b]52;c;ZXZpbA==\u0007b"), "a<U+001B>]52;c;ZXZpbA==<U+0007>b");
    assert.equal(sanitizeUntrusted("if (x\u202e) {}"), "if (x<U+202E>) {}");
    assert.equal(sanitizeUntrusted("pay\u200bpal.com"), "pay<U+200B>pal.com");
    assert.equal(sanitizeUntrusted("line\r\n"), "line<U+000D>\n");
  });

  it("keeps ordinary text, tabs, newlines, and non-Latin text", () => {
    const text = "const x = 1;\n\tfoo('héllo 日本 🙂')";
    assert.equal(sanitizeUntrusted(text), text);
  });
});

// biome-ignore lint/suspicious/noExplicitAny: test helper calls tool definitions directly
async function run(def: any, params: unknown, signal?: AbortSignal) {
  // Pass a context with a host cwd, as pi does: the tools must still run in /work.
  const ctx = { cwd: "/Users/nobody/host-only-dir" };
  const result = await def.execute("t1", params, signal, undefined, ctx);
  return result.content
    .filter((c: { type: string }) => c.type === "text")
    .map((c: { text: string }) => c.text)
    .join("\n");
}

describe("sandboxTool context", () => {
  it("hands the wrapped tool /work as cwd, not the child's host cwd", async () => {
    class Ctx {
      #secret = "kept";
      cwd = "/Users/nobody/host-only-dir";
      reveal() {
        return this.#secret;
      }
    }
    let seen: { cwd?: string; reveal?: string } = {};
    const fake = {
      name: "fake",
      label: "Fake",
      description: "fake",
      parameters: {},
      async execute(_id: string, _p: unknown, _s: unknown, _u: unknown, ctx: Ctx) {
        seen = { cwd: ctx.cwd, reveal: ctx.reveal() };
        return { content: [{ type: "text", text: "ok" }] };
      },
    };
    // biome-ignore lint/suspicious/noExplicitAny: minimal fake tool definition
    const tool = sandboxTool(fake as any, { name: "sandbox_fake", extra: "", containerValid: true });
    await tool.execute("t", {}, undefined, undefined, new Ctx() as never);
    assert.deepEqual(seen, { cwd: "/work", reveal: "kept" });
  });
});

describe("sandboxTool without a container", () => {
  it("refuses to run instead of falling back to the host", async () => {
    const tool = sandboxTool(createBashToolDefinition("/work", { operations: createContainerBashOps("") }), {
      name: "sandbox_bash",
      extra: "",
      containerValid: false,
    });
    assert.equal(tool.name, "sandbox_bash");
    await assert.rejects(run(tool, { command: "echo hi" }), /Refusing to run/);
  });
});

const dockerUp = spawnSync("docker", ["info"], { stdio: "ignore", timeout: 20_000 }).status === 0;

describe("container tools (docker)", { skip: !dockerUp && "docker not running" }, () => {
  let sandbox: Sandbox;
  // biome-ignore lint/suspicious/noExplicitAny: tool definitions under test
  let bash: any, read: any, ls: any;

  before(async () => {
    sandbox = await createSandbox({ name: "test tools", id: Math.random().toString(16).slice(2, 8), network: "offline" });
    await docker(["exec", "-u", SANDBOX_USER, sandbox.container, "sh", "-c",
      "mkdir -p /work/src && printf 'evil\\033[2J\\342\\200\\256txt\\n' > /work/src/a.txt"]);
    const opts = { extra: "", containerValid: true };
    bash = sandboxTool(createBashToolDefinition("/work", { operations: createContainerBashOps(sandbox.container), exposeSessionEnvironment: false }), { ...opts, name: "sandbox_bash" });
    read = sandboxTool(createReadToolDefinition("/work", { operations: createContainerReadOps(sandbox.container) }), { ...opts, name: "sandbox_read" });
    ls = sandboxTool(createLsToolDefinition("/work", { operations: createContainerLsOps(sandbox.container) }), { ...opts, name: "sandbox_ls" });
  });

  after(async () => {
    if (sandbox) await destroySandbox(sandbox);
  });

  it("bash runs inside the container as the sandbox user with no host env", async () => {
    const out = await run(bash, { command: "hostname; id -u; pwd; env | grep -c '^PI_' || true" });
    assert.match(out, /^sandbox$/m);
    assert.match(out, /^10001$/m);
    assert.match(out, /^\/work$/m);
    assert.match(out, /^0$/m);
  });

  it("read and ls see container files and sanitize them", async () => {
    const text = await run(read, { path: "src/a.txt" });
    assert.match(text, /evil<U\+001B>\[2J<U\+202E>txt/);
    assert.match(await run(ls, { path: "src" }), /a\.txt/);
  });

  it("cannot reach host files", async () => {
    const hostSecret = `${homedir()}/.pi/agent/auth.json`;
    await assert.rejects(run(read, { path: hostSecret }));
    const out = await run(bash, { command: `test -e '${hostSecret}' && echo FOUND || echo absent` });
    assert.match(out, /absent/);
  });

  it("timeout kills the whole process group inside the container", async () => {
    await assert.rejects(run(bash, { command: "sleep 300 & sleep 300", timeout: 2 }), /timed out|timeout/i);
    await new Promise((r) => setTimeout(r, 1000));
    const ps = await docker(["exec", sandbox.container, "sh", "-c", "pgrep -c sleep || true"]);
    // Only the container's own `sleep <ttl>` main process remains.
    assert.equal(ps.stdout.trim(), "1");
  });

  it("abort kills the command", async () => {
    const controller = new AbortController();
    const pending = run(bash, { command: "sleep 300" }, controller.signal);
    setTimeout(() => controller.abort(), 1000);
    await assert.rejects(pending, /abort/i);
    await new Promise((r) => setTimeout(r, 1000));
    const ps = await docker(["exec", sandbox.container, "sh", "-c", "pgrep -c sleep || true"]);
    assert.equal(ps.stdout.trim(), "1");
  });
});
