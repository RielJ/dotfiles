// @ts-nocheck -- focused runtime tests use a minimal structural ExtensionAPI mock.
import assert from "node:assert/strict";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, it } from "node:test";
import subagentsExtension, { __test__ } from "../index.ts";
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
      "lsp_diagnostics",
    ]) {
      const path = __test__.getToolExtensionPath(tool);
      assert.ok(path, `${tool} should resolve`);
      assert.ok(existsSync(path), `${tool} backing extension should exist`);
    }
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
    assert.equal(
      extensionArgs.length,
      2,
      "web_search and ffgrep back one extension each",
    );
    for (const arg of extensionArgs) {
      assert.ok(existsSync(arg.replace(/^'|'$/g, "")));
    }
  });
});

describe("extension registration", () => {
  it("registers spawn, message, list, and attach tools", () => {
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
        "subagents_list",
        "subagent_attach",
      ].sort(),
      tools.sort(),
    );
    assert.ok(commands.includes("subagent"));
    assert.ok(commands.includes("subagent-attach"));
  });
});
