// @ts-nocheck -- focused runtime tests use a minimal structural ExtensionAPI mock.
import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, describe, it } from "node:test";
import subagentsExtension, {
  DEFAULT_SUBAGENT_MODEL,
  __test__,
} from "../index.ts";
import {
  loadoutSidecarPath,
  readSubagentLoadout,
  writeSubagentLoadout,
  type SubagentLoadout,
} from "../session.ts";
import { shellEscape } from "../tmux.ts";
import {
  POOL_SESSION,
  capturePane,
  createWindow,
  killWindow,
  sanitizeWindowName,
  sendMessage,
  tmuxAvailable,
  windowAlive,
  windowTarget,
} from "../tmux-pool.ts";

const tempDirs: string[] = [];
afterEach(() => {
  for (const dir of tempDirs.splice(0))
    rmSync(dir, { recursive: true, force: true });
});

describe("tmux pool", () => {
  it("uses one _pi-agents session and safe task-oriented window names", () => {
    assert.equal(POOL_SESSION, "_pi-agents");
    assert.equal(
      sanitizeWindowName("OAuth Refresh: Worker #1"),
      "oauth-refresh-worker-1",
    );
    assert.equal(windowTarget("OAuth Refresh"), "_pi-agents:oauth-refresh");
  });

  it("shell-escapes single quotes", () => {
    assert.equal(shellEscape("it's fine"), "'it'\\''s fine'");
  });

  // Regression: `tmux display-message -t <missing-window>` exits 0 and falls back
  // to the session's current window. Liveness must therefore be an exact match
  // against list-windows, or dead agents look alive, pollForExit never finishes,
  // and steer messages land in another agent's window.
  it(
    "reports a killed window as dead and refuses to steer it",
    { skip: !tmuxAvailable() },
    () => {
      const name = `pi-subagent-test-${process.pid}`;
      createWindow(name, process.cwd());
      assert.equal(windowAlive(name), true);

      killWindow(name);
      assert.equal(windowAlive(name), false);
      assert.equal(capturePane(name, 3), "");
      assert.equal(sendMessage(name, "should not be delivered"), false);
    },
  );
});

describe("profiles and sandbox loadout", () => {
  it("loads the bundled general profile and derives a task name", () => {
    const profile = __test__.loadAgentDefaults("general");
    assert.ok(profile);
    assert.match(profile.tools, /ffgrep/);
    assert.equal(
      __test__.taskName("Investigate OAuth refresh failures now"),
      "investigate-oauth-refresh-failures-now",
    );
  });

  it("persists shared/worktree metadata for safe resume", () => {
    const dir = mkdtempSync(join(tmpdir(), "subagent-loadout-"));
    tempDirs.push(dir);
    const session = join(dir, "child.jsonl");
    const loadout: SubagentLoadout = {
      agent: "implement",
      toolAllowlist: "read,edit,ask_question",
      model: null,
      thinking: null,
      systemPromptMode: "append",
      identity: "Implement carefully",
      spawnable: null,
      autoExit: true,
      cwd: "/tmp/project",
      agentDir: null,
      isolation: "worktree",
      worktree: {
        id: "token-fix",
        path: "/tmp/token-fix",
        branch: "_wt/token-fix",
      },
      context: "Only touch auth files",
      profile: "implement",
    };
    writeSubagentLoadout(session, loadout);
    assert.ok(existsSync(loadoutSidecarPath(session)));
    assert.deepEqual(readSubagentLoadout(session), loadout);
  });

  it("resolves verified local tool extensions", () => {
    for (const tool of [
      "ffgrep",
      "fffind",
      "web_search",
      "qmd_search",
      "lens_diagnostics",
    ]) {
      const path = __test__.getToolExtensionPath(tool);
      assert.ok(path, `${tool} should resolve`);
      assert.ok(existsSync(path), `${tool} backing extension should exist`);
    }
  });
});

describe("model selection", () => {
  it("pins every bundled profile to an anthropic model", () => {
    for (const name of [
      "general",
      "explore",
      "research",
      "review",
      "implement",
    ]) {
      const profile = __test__.loadAgentDefaults(name);
      assert.ok(profile, `${name} profile should load`);
      assert.match(
        profile.model ?? "",
        /^anthropic\//,
        `${name} must run on Claude`,
      );
    }
  });

  it("falls back to Claude rather than the session default", () => {
    // A profile with no `model:` must not inherit settings.json's default
    // provider, which is currently openai-codex.
    assert.match(DEFAULT_SUBAGENT_MODEL, /^anthropic\/claude-/);
  });

  it("passes the resolved model through to the child command", () => {
    const dir = mkdtempSync(join(tmpdir(), "subagent-model-"));
    tempDirs.push(dir);
    const parts: string[] = ["pi"];
    __test__.applySandboxToParts(
      parts,
      {
        agent: "review",
        toolAllowlist: null,
        model: "anthropic/claude-opus-5",
        thinking: "high",
        systemPromptMode: null,
        identity: null,
        spawnable: null,
        autoExit: true,
        cwd: dir,
        agentDir: null,
      },
      { artifactDir: dir, name: "login-review" },
    );
    assert.match(parts.join(" "), /--model 'anthropic\/claude-opus-5:high'/);
  });
});

describe("child sandbox", () => {
  it("always grants the control tools the child needs to answer back", () => {
    const allowlist = __test__.buildSubagentToolAllowlist("read, ffgrep");
    assert.deepEqual(allowlist.split(",").sort(), [
      "ask_question",
      "ffgrep",
      "read",
    ]);
    // No restriction requested → child keeps its default toolset.
    assert.equal(__test__.buildSubagentToolAllowlist(""), null);
  });

  it("replays a default-deny sandbox with only the backing extensions", () => {
    const dir = mkdtempSync(join(tmpdir(), "subagent-sandbox-"));
    tempDirs.push(dir);
    const parts: string[] = ["pi"];
    __test__.applySandboxToParts(
      parts,
      {
        agent: "research",
        toolAllowlist: "read,web_search,ffgrep,ask_question",
        model: "gpt-5.6",
        thinking: null,
        systemPromptMode: "append",
        identity: "Research carefully",
        spawnable: null,
        autoExit: true,
        cwd: dir,
        agentDir: null,
      },
      { artifactDir: dir, name: "auth-docs" },
    );

    const command = parts.join(" ");
    assert.match(command, /--no-extensions/);
    assert.match(command, /--tools 'read,web_search,ffgrep,ask_question'/);
    assert.match(command, /--model 'gpt-5\.6'/);
    assert.match(command, /--append-system-prompt/);

    const extensionArgs = parts.filter((_, index) => parts[index - 1] === "-e");
    const base = new Set(
      __test__
        .getChildBaseExtensionPaths("read,web_search,ffgrep,ask_question")
        .map(shellEscape),
    );
    const toolExtensions = extensionArgs.filter((arg) => !base.has(arg));
    assert.equal(
      toolExtensions.length,
      2,
      "web_search and ffgrep back one extension each",
    );
    for (const arg of extensionArgs) {
      assert.ok(existsSync(arg.replace(/^'|'$/g, "")));
    }
  });

  it("loads the base extensions in every default-deny child, pi-bash-bg only with bash", () => {
    // pi-vcc matters most: without it the child falls back to pi's
    // model-written summary, which is capped at 0.8 x reserveTokens and fails
    // once thinking plus summary outgrow it.
    const agentDir = mkdtempSync(join(tmpdir(), "subagent-agentdir-"));
    tempDirs.push(agentDir);
    const npm = join(agentDir, "npm", "node_modules");
    const vcc = join(npm, "@sting8k", "pi-vcc", "index.ts");
    const milk = join(npm, "@tomooshi", "condensed-milk-pi", "index.ts");
    const imageGuard = join(agentDir, "extensions", "image-media-type-guard.ts");
    const schemaCompat = join(agentDir, "extensions", "anthropic-tool-schema-compat", "index.ts");
    const bashBg = join(npm, "pi-bash-bg", "dist", "index.js");
    for (const file of [vcc, milk, imageGuard, schemaCompat, bashBg]) {
      mkdirSync(dirname(file), { recursive: true });
      writeFileSync(file, "export default () => {};\n");
    }
    const spawn = (toolAllowlist: string) => {
      const parts: string[] = ["pi"];
      __test__.applySandboxToParts(
        parts,
        {
          agent: "implement",
          toolAllowlist,
          model: null,
          thinking: null,
          systemPromptMode: null,
          identity: null,
          spawnable: null,
          autoExit: true,
          cwd: agentDir,
          agentDir: null,
        },
        { artifactDir: agentDir, name: "docs" },
      );
      return parts.filter((_, index) => parts[index - 1] === "-e");
    };
    const base = [vcc, milk, imageGuard, schemaCompat].map(shellEscape);
    const previous = process.env.PI_CODING_AGENT_DIR;
    process.env.PI_CODING_AGENT_DIR = agentDir;
    try {
      assert.deepEqual(spawn("read,bash,ask_question"), [...base, shellEscape(bashBg)]);
      assert.deepEqual(spawn("read,ls,ask_question"), base);
      // A missing extension is skipped rather than passed to pi as a bad -e.
      rmSync(milk);
      assert.deepEqual(
        spawn("read,ls,ask_question"),
        base.filter((arg) => arg !== shellEscape(milk)),
      );
    } finally {
      if (previous === undefined) delete process.env.PI_CODING_AGENT_DIR;
      else process.env.PI_CODING_AGENT_DIR = previous;
    }
  });
});

describe("extension registration", () => {
  it("registers spawn, message, close, list, and attach tools", () => {
    const tools: string[] = [];
    const commands: string[] = [];
    const api = {
      on() {},
      registerTool(definition: { name: string }) {
        tools.push(definition.name);
      },
      registerCommand(name: string) {
        commands.push(name);
      },
      registerMessageRenderer() {},
      sendUserMessage() {},
      sendMessage() {},
    };
    subagentsExtension(api);
    assert.deepEqual(
      [
        "subagent",
        "subagent_message",
        "subagent_close",
        "subagents_list",
        "subagent_attach",
      ].sort(),
      tools.sort(),
    );
    assert.ok(commands.includes("subagent"));
    assert.ok(commands.includes("subagent-attach"));
  });
});

describe("external widget rows", () => {
  const strip = (s: string) => s.replace(/\x1b\[[0-9;]*m/g, "");
  const { renderSubagentWidgetLines, externalRowsHost, collectExternalRows } = __test__;

  afterEach(() => {
    externalRowsHost().sources.clear();
  });

  it("renders provider rows inside the Subagents box and counts running ones", () => {
    const lines = renderSubagentWidgetLines(
      [],
      70,
      [
        { status: "running", startedAt: 0, name: "Opus 5.5", tag: "plan r3k2", detail: "read plan.ts" },
        { status: "done", startedAt: 0, elapsedMs: 41_000, name: "Explorer", tag: "plan r3k2", detail: "context 3.2KB" },
        { status: "error", startedAt: 0, elapsedMs: 5_000, name: "GLM 5.2", tag: "plan r3k2 follow-up", detail: "stopped" },
      ],
      72_000,
    ).map(strip);
    assert.equal(lines.length, 5);
    assert.match(lines[0] ?? "", /^╭─ Subagents ─+ 1 running ─╮$/);
    assert.match(lines[1] ?? "", /^│ ⟳ 01:12  Opus 5\.5 \(plan r3k2\) +read plan\.ts │$/);
    assert.match(lines[2] ?? "", /^│ ✓ 00:41  Explorer \(plan r3k2\) +context 3\.2KB │$/);
    assert.match(lines[3] ?? "", /^│ ✗ 00:05  GLM 5\.2 \(plan r3k2 follow-up\) +stopped │$/);
    for (const line of lines) assert.equal(line.length, 70);
  });

  it("collects rows from every provider and survives a throwing one", () => {
    const host = externalRowsHost();
    host.sources.set("a", () => [{ status: "running", startedAt: 0, name: "x" }]);
    host.sources.set("b", () => {
      throw new Error("boom");
    });
    assert.deepEqual(
      collectExternalRows().map((r: { name: string }) => r.name),
      ["x"],
    );
  });

  it("registers itself as the host on load", () => {
    const pi = {
      on() {},
      registerTool() {},
      registerCommand() {},
      registerShortcut() {},
      registerMessageRenderer() {},
      events: { on() {}, emit() {} },
    } as unknown as Parameters<typeof subagentsExtension>[0];
    externalRowsHost().refresh = undefined;
    subagentsExtension(pi);
    assert.equal(typeof externalRowsHost().refresh, "function");
  });
});
