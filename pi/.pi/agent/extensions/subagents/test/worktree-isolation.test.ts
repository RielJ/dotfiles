import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, afterEach, before, describe, it } from "node:test";
import {
  allocateSubagentWorktree,
  describeWorktreeRelease,
  reattachSubagentWorktree,
  releaseSubagentWorktree,
  type SubagentWorktree,
  type WorktreeRelease,
} from "../worktree-isolation.ts";

// Hermetic git: ignore the developer's global/system config (hooks, signing,
// global excludes) so the tests behave the same on every machine.
const savedEnv: Record<string, string | undefined> = {};
const hermeticEnv: Record<string, string> = {
  GIT_CONFIG_NOSYSTEM: "1",
  GIT_AUTHOR_NAME: "Test",
  GIT_AUTHOR_EMAIL: "test@example.com",
  GIT_COMMITTER_NAME: "Test",
  GIT_COMMITTER_EMAIL: "test@example.com",
};
let configHome = "";

before(() => {
  configHome = mkdtempSync(join(tmpdir(), "subagent-wt-config-"));
  const globalConfig = join(configHome, "gitconfig");
  writeFileSync(globalConfig, "");
  for (const [key, value] of Object.entries({
    ...hermeticEnv,
    GIT_CONFIG_GLOBAL: globalConfig,
  })) {
    savedEnv[key] = process.env[key];
    process.env[key] = value;
  }
});

after(() => {
  for (const [key, value] of Object.entries(savedEnv)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  rmSync(configHome, { recursive: true, force: true });
});

const tempDirs: string[] = [];
afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

function git(cwd: string, ...args: string[]): string {
  return execFileSync("git", ["-C", cwd, ...args], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();
}

/** A real repo with one commit on `main` and a `phase/5` branch one commit ahead. */
function makeRepo(): string {
  const repo = realpathSync(mkdtempSync(join(tmpdir(), "subagent-wt-repo-")));
  tempDirs.push(repo);
  git(repo, "init", "-q", "-b", "main");
  writeFileSync(join(repo, "README.md"), "hello\n");
  git(repo, "add", "README.md");
  git(repo, "commit", "-q", "-m", "init");
  git(repo, "switch", "-q", "-c", "phase/5");
  writeFileSync(join(repo, "phase.txt"), "phase 5\n");
  git(repo, "add", "phase.txt");
  git(repo, "commit", "-q", "-m", "phase 5");
  git(repo, "switch", "-q", "main");
  return repo;
}

function branches(repo: string): string[] {
  return git(repo, "for-each-ref", "--format=%(refname:short)", "refs/heads")
    .split("\n")
    .filter(Boolean);
}

function localConfig(repo: string): string {
  return git(repo, "config", "--local", "--list");
}

describe("allocateSubagentWorktree", () => {
  it("starts on a new branch at the tip of an existing requested branch", () => {
    const repo = makeRepo();
    const phaseTip = git(repo, "rev-parse", "phase/5");
    const configBefore = localConfig(repo);

    const wt = allocateSubagentWorktree({
      cwd: repo,
      name: "Phase Worker",
      branch: "phase/5",
    });

    assert.equal(wt.repoRoot, repo);
    assert.equal(wt.path, join(repo, ".pi", "git-worktrees", "phase-worker"));
    assert.equal(wt.branch, "phase-worker");
    assert.equal(wt.base, phaseTip);
    assert.equal(wt.createdBranch, true);
    assert.equal(git(wt.path, "rev-parse", "HEAD"), phaseTip);
    assert.equal(git(wt.path, "branch", "--show-current"), "phase-worker");
    assert.ok(existsSync(join(wt.path, "phase.txt")));
    // The requested branch and the main checkout are untouched.
    assert.equal(git(repo, "rev-parse", "phase/5"), phaseTip);
    assert.equal(git(repo, "branch", "--show-current"), "main");
    // No _wt/ branches, no git config writes.
    assert.ok(!branches(repo).some((b) => b.startsWith("_wt/")));
    assert.equal(localConfig(repo), configBefore);
  });

  it("works from a subdirectory and from inside another worktree", () => {
    const repo = makeRepo();
    mkdirSync(join(repo, "sub"));
    const first = allocateSubagentWorktree({ cwd: join(repo, "sub"), name: "a" });
    assert.equal(first.repoRoot, repo);
    const second = allocateSubagentWorktree({ cwd: first.path, name: "b" });
    assert.equal(second.repoRoot, repo);
    assert.equal(second.path, join(repo, ".pi", "git-worktrees", "b"));
  });

  it("creates a missing requested branch from the main checkout's HEAD", () => {
    const repo = makeRepo();
    const mainTip = git(repo, "rev-parse", "main");

    const wt = allocateSubagentWorktree({
      cwd: repo,
      name: "worker",
      branch: "feature/new",
    });

    assert.equal(wt.branch, "feature/new");
    assert.equal(wt.createdBranch, true);
    assert.equal(git(wt.path, "branch", "--show-current"), "feature/new");
    assert.equal(git(wt.path, "rev-parse", "HEAD"), mainTip);
    assert.ok(branches(repo).includes("feature/new"));
  });

  it("names the branch after the slug when no branch is given", () => {
    const repo = makeRepo();
    const mainTip = git(repo, "rev-parse", "HEAD");
    const configBefore = localConfig(repo);

    const wt = allocateSubagentWorktree({ cwd: repo, name: "oauth-refresh" });

    assert.equal(wt.branch, "oauth-refresh");
    assert.equal(git(wt.path, "rev-parse", "HEAD"), mainTip);
    assert.equal(git(wt.path, "branch", "--show-current"), "oauth-refresh");
    assert.ok(!branches(repo).some((b) => b.startsWith("_wt/")));
    assert.equal(localConfig(repo), configBefore);
  });

  it("dedupes the directory but never reuses an existing branch", () => {
    const repo = makeRepo();
    mkdirSync(join(repo, ".pi", "git-worktrees", "worker"), { recursive: true });

    const wt = allocateSubagentWorktree({ cwd: repo, name: "worker" });

    assert.equal(wt.path, join(repo, ".pi", "git-worktrees", "worker-2"));
    assert.equal(wt.branch, "worker-2");
  });

  it("refuses a branch name collision and leaves the existing branch unchanged", () => {
    const repo = makeRepo();
    git(repo, "branch", "worker", "phase/5");
    const before = git(repo, "rev-parse", "worker");

    assert.throws(
      () => allocateSubagentWorktree({ cwd: repo, name: "worker", branch: "main" }),
      /branch "worker" already exists/,
    );
    assert.throws(
      () => allocateSubagentWorktree({ cwd: repo, name: "worker" }),
      /branch "worker" already exists/,
    );

    assert.equal(git(repo, "rev-parse", "worker"), before);
    assert.equal(git(repo, "worktree", "list", "--porcelain").split("\n").filter((l) => l.startsWith("worktree ")).length, 1);
    assert.ok(!existsSync(join(repo, ".pi", "git-worktrees", "worker")));
  });

  it("rejects a cwd that is not a git repository", () => {
    const dir = realpathSync(mkdtempSync(join(tmpdir(), "subagent-wt-plain-")));
    tempDirs.push(dir);
    assert.throws(
      () => allocateSubagentWorktree({ cwd: dir, name: "x" }),
      /not a git repository/,
    );
  });
});

describe("releaseSubagentWorktree", () => {
  it("removes a clean worktree and keeps its branch", () => {
    const repo = makeRepo();
    const wt = allocateSubagentWorktree({ cwd: repo, name: "clean", branch: "phase/5" });
    // Committed work is safe on the branch, so the worktree is still clean.
    writeFileSync(join(wt.path, "done.txt"), "done\n");
    git(wt.path, "add", "done.txt");
    git(wt.path, "commit", "-q", "-m", "done");
    const tip = git(wt.path, "rev-parse", "HEAD");

    const release = releaseSubagentWorktree(wt);

    assert.equal(release.kind, "removed");
    assert.ok(!existsSync(wt.path));
    assert.ok(branches(repo).includes("clean"));
    assert.equal(git(repo, "rev-parse", "clean"), tip);
    assert.match(describeWorktreeRelease(release), /^Removed worktree .*branch "clean" is kept/);
  });

  it("keeps a worktree with modified tracked files", () => {
    const repo = makeRepo();
    const wt = allocateSubagentWorktree({ cwd: repo, name: "dirty" });
    writeFileSync(join(wt.path, "README.md"), "changed\n");

    const release = releaseSubagentWorktree(wt);

    assert.equal(release.kind, "kept-dirty");
    assert.equal(release.kind === "kept-dirty" && release.files, 1);
    assert.ok(existsSync(join(wt.path, "README.md")));
    const text = describeWorktreeRelease(release);
    assert.match(text, /^Kept worktree .*dirty: 1 uncommitted or untracked file; commit or move it,/);
    assert.match(text, /git worktree remove /);
    assert.ok(branches(repo).includes("dirty"));
  });

  it("keeps a worktree whose only changes are untracked files", () => {
    const repo = makeRepo();
    const wt = allocateSubagentWorktree({ cwd: repo, name: "untracked" });
    mkdirSync(join(wt.path, "new"));
    writeFileSync(join(wt.path, "new", "a.txt"), "a\n");
    writeFileSync(join(wt.path, "new", "b.txt"), "b\n");

    const release = releaseSubagentWorktree(wt);

    assert.equal(release.kind, "kept-dirty");
    assert.equal(release.kind === "kept-dirty" && release.files, 2);
    assert.ok(existsSync(join(wt.path, "new", "a.txt")));
    assert.match(describeWorktreeRelease(release), /2 uncommitted or untracked files/);
  });

  it("keeps the worktree and reports git's message when git refuses", () => {
    const repo = makeRepo();
    const wt = allocateSubagentWorktree({ cwd: repo, name: "locked" });
    git(repo, "worktree", "lock", wt.path);

    let release: WorktreeRelease | undefined;
    assert.doesNotThrow(() => {
      release = releaseSubagentWorktree(wt);
    });
    assert.ok(release);

    assert.equal(release.kind, "kept-error");
    assert.ok(existsSync(wt.path));
    assert.match(describeWorktreeRelease(release), /^Kept worktree .*cannot remove a locked working tree/);
    assert.ok(branches(repo).includes("locked"));
  });

  it("reports a worktree that is already gone without throwing", () => {
    const repo = makeRepo();
    const wt = allocateSubagentWorktree({ cwd: repo, name: "gone" });
    git(repo, "worktree", "remove", wt.path);

    const release = releaseSubagentWorktree(wt);

    assert.equal(release.kind, "already-gone");
    assert.ok(branches(repo).includes("gone"));
  });
});

describe("reattachSubagentWorktree", () => {
  it("recreates a removed worktree on its kept branch for resume", () => {
    const repo = makeRepo();
    const wt = allocateSubagentWorktree({ cwd: repo, name: "again" });
    writeFileSync(join(wt.path, "x.txt"), "x\n");
    git(wt.path, "add", "x.txt");
    git(wt.path, "commit", "-q", "-m", "x");
    const tip = git(wt.path, "rev-parse", "HEAD");
    assert.equal(releaseSubagentWorktree(wt).kind, "removed");

    const back = reattachSubagentWorktree(wt);

    assert.equal(back.path, wt.path);
    assert.equal(back.branch, "again");
    assert.equal(back.createdBranch, false);
    assert.equal(git(back.path, "rev-parse", "HEAD"), tip);
  });

  it("reuses a worktree that still exists", () => {
    const repo = makeRepo();
    const wt = allocateSubagentWorktree({ cwd: repo, name: "still" });
    const back = reattachSubagentWorktree(wt);
    assert.equal(back.path, wt.path);
  });
});

describe("closing a worktree subagent", () => {
  // Imported lazily so the module-level git env above is already in place.
  async function harness() {
    const { default: subagentsExtension, __test__ } = await import("../index.ts");
    const { createStatusState } = await import("../status.ts");
    const sent: Array<{ content: string }> = [];
    subagentsExtension({
      on() {},
      registerTool() {},
      registerCommand() {},
      registerMessageRenderer() {},
      sendUserMessage() {},
      sendMessage(message: { content: string }) {
        sent.push(message);
      },
    } as never);
    const fakeRunning = (
      worktree: SubagentWorktree | undefined,
      extra: { keepAlive?: boolean; turnsDelivered?: number } = {},
    ) => {
      const dir = realpathSync(mkdtempSync(join(tmpdir(), "subagent-wt-session-")));
      tempDirs.push(dir);
      const sessionFile = join(dir, "child.jsonl");
      writeFileSync(sessionFile, `${JSON.stringify({ type: "session", id: "s" })}\n`);
      const running = {
        id: `id-${Math.random().toString(16).slice(2, 8)}`,
        name: `wt-test-${process.pid}-${Math.random().toString(16).slice(2, 6)}`,
        task: "t",
        surface: `wt-test-${process.pid}-surface`,
        startTime: Date.now(),
        sessionFile,
        interactive: false,
        keepAlive: true,
        parked: true,
        parkedSince: Date.now(),
        turnsDelivered: 1,
        deliveredEntryCount: 1,
        worktree,
        statusState: createStatusState({ source: "pi", startTimeMs: Date.now() }),
        ...extra,
      };
      __test__.runningSubagents.set(running.id, running);
      return running;
    };
    return { __test__, sent, fakeRunning };
  }

  it("subagent_close removes a clean worktree, keeps the branch, and says so", async () => {
    const { __test__, fakeRunning } = await harness();
    const repo = makeRepo();
    const wt = allocateSubagentWorktree({ cwd: repo, name: "close-clean" });
    const running = fakeRunning(wt);

    const result = __test__.closeSubagentByName({ name: running.name });

    assert.equal(result.details.status, "closed");
    assert.match(result.content[0].text, /Removed worktree .*close-clean; branch "close-clean" is kept/);
    assert.ok("worktree" in result.details);
    assert.equal(result.details.worktree?.kind, "removed");
    assert.ok(!existsSync(wt.path));
    assert.ok(branches(repo).includes("close-clean"));
  });

  it("subagent_close keeps a dirty worktree and reports why", async () => {
    const { __test__, fakeRunning } = await harness();
    const repo = makeRepo();
    const wt = allocateSubagentWorktree({ cwd: repo, name: "close-dirty" });
    writeFileSync(join(wt.path, "work.txt"), "uncommitted\n");
    const running = fakeRunning(wt);

    const result = __test__.closeSubagentByName({ name: running.name });

    assert.equal(result.details.status, "closed");
    assert.match(result.content[0].text, /Kept worktree .*close-dirty .*1 uncommitted or untracked file/);
    assert.ok(existsSync(join(wt.path, "work.txt")));
  });

  it("an idle close reports the worktree outcome in its notice", async () => {
    const { __test__, fakeRunning } = await harness();
    const repo = makeRepo();
    const wt = allocateSubagentWorktree({ cwd: repo, name: "idle-dirty" });
    writeFileSync(join(wt.path, "README.md"), "edited\n");
    const running = fakeRunning(wt);

    __test__.closeSubagent(running, "idle");
    const decision = __test__.resolveFinalDelivery(running, 1);

    assert.equal(decision.kind, "notice");
    assert.match(decision.text, /idle minutes/);
    assert.match(decision.text, /Kept worktree .*idle-dirty/);
    assert.ok(existsSync(wt.path));
  });

  it("a completed one-shot run releases its worktree once and appends the outcome", async () => {
    const { __test__, fakeRunning } = await harness();
    const repo = makeRepo();
    const wt = allocateSubagentWorktree({ cwd: repo, name: "one-shot" });
    const running = fakeRunning(wt, { keepAlive: false, turnsDelivered: 0 });

    // What watchSubagent does when the process exits on its own.
    const first = __test__.releaseRunningResources(running);
    const second = __test__.releaseRunningResources(running);

    assert.ok(first);
    assert.match(first, /Removed worktree .*one-shot/);
    assert.equal(second, first);
    assert.equal(__test__.resolveFinalDelivery(running, 1).kind, "deliver");
    assert.match(__test__.withReleaseNote("result", running), /^result\n\nRemoved worktree /);
    assert.ok(branches(repo).includes("one-shot"));
  });

  it("closing a shared subagent adds no worktree note", async () => {
    const { __test__, fakeRunning } = await harness();
    const running = fakeRunning(undefined);
    const result = __test__.closeSubagentByName({ name: running.name });
    assert.doesNotMatch(result.content[0].text, /worktree/i);
    assert.equal(__test__.withReleaseNote("result", running), "result");
  });

  it("a closed worktree subagent resumed and closed again removes its worktree again", async () => {
    const { __test__, fakeRunning } = await harness();
    const repo = makeRepo();
    const wt = allocateSubagentWorktree({ cwd: repo, name: "round-trip" });
    writeFileSync(join(wt.path, "a.txt"), "a\n");
    git(wt.path, "add", "a.txt");
    git(wt.path, "commit", "-q", "-m", "a");
    const first = fakeRunning(wt);
    const firstClose = __test__.closeSubagentByName({ name: first.name }).details;
    assert.ok("worktree" in firstClose);
    assert.equal(firstClose.worktree?.kind, "removed");
    assert.ok(!existsSync(wt.path));

    // What subagent_message does before relaunching a closed worktree subagent.
    const back = reattachSubagentWorktree(wt);
    assert.ok(existsSync(join(back.path, "a.txt")));
    writeFileSync(join(back.path, "b.txt"), "b\n");
    git(back.path, "add", "b.txt");
    git(back.path, "commit", "-q", "-m", "b");
    const tip = git(back.path, "rev-parse", "HEAD");
    const second = fakeRunning(back);

    const result = __test__.closeSubagentByName({ name: second.name });

    // The release from the first close must not be reused for the new run.
    assert.ok("worktree" in result.details);
    assert.equal(result.details.worktree?.kind, "removed");
    assert.ok(!existsSync(back.path));
    assert.equal(git(repo, "rev-parse", "round-trip"), tip);
  });

  it("a git failure during close does not throw or block closing", async () => {
    const { __test__, fakeRunning } = await harness();
    const repo = makeRepo();
    const wt = allocateSubagentWorktree({ cwd: repo, name: "close-locked" });
    git(repo, "worktree", "lock", wt.path);
    const running = fakeRunning(wt);

    const result = __test__.closeSubagentByName({ name: running.name });

    assert.equal(result.details.status, "closed");
    assert.equal(__test__.runningSubagents.has(running.id), false);
    assert.match(result.content[0].text, /Kept worktree .*locked working tree/);
  });
});

// watchSubagent is the path every exit goes through: the child finishing on its
// own, a Claude child writing its sentinel, and cancel/crash. pollForExit reads
// the `.exit` sidecar and the sentinel file before it touches tmux, so these
// drive the real watcher without a live window.
describe("watcher releases the worktree when the subagent exits", () => {
  async function setup(name: string, extra: Record<string, unknown> = {}) {
    const { default: subagentsExtension, __test__ } = await import("../index.ts");
    const { createStatusState } = await import("../status.ts");
    subagentsExtension({
      on() {},
      registerTool() {},
      registerCommand() {},
      registerMessageRenderer() {},
      sendUserMessage() {},
      sendMessage() {},
    } as never);
    const repo = makeRepo();
    const wt = allocateSubagentWorktree({ cwd: repo, name });
    const dir = realpathSync(mkdtempSync(join(tmpdir(), "subagent-wt-watch-")));
    tempDirs.push(dir);
    const sessionFile = join(dir, "child.jsonl");
    writeFileSync(sessionFile, `${JSON.stringify({ type: "session", id: "s" })}\n`);
    const running = {
      id: `id-${Math.random().toString(16).slice(2, 8)}`,
      name: `wt-watch-${process.pid}-${Math.random().toString(16).slice(2, 6)}`,
      task: "t",
      surface: `wt-watch-${process.pid}-surface`,
      startTime: Date.now(),
      sessionFile,
      interactive: false,
      keepAlive: false,
      turnsDelivered: 0,
      deliveredEntryCount: 1,
      worktree: wt,
      worktreeRelease: undefined as WorktreeRelease | undefined,
      statusState: createStatusState({ source: "pi", startTimeMs: Date.now() }),
      ...extra,
    };
    __test__.runningSubagents.set(running.id, running);
    const watch = (signal = new AbortController().signal) =>
      __test__.watchSubagent(running as never, signal);
    return { __test__, repo, wt, dir, sessionFile, running, watch };
  }

  it("removes a clean worktree when a Pi child exits on its own", async () => {
    const { __test__, repo, wt, sessionFile, running, watch } = await setup("exit-clean");
    writeFileSync(`${sessionFile}.exit`, JSON.stringify({ type: "done" }));

    const result = await watch();

    assert.equal(result.exitCode, 0);
    assert.equal(__test__.runningSubagents.has(running.id), false);
    assert.equal(running.worktreeRelease?.kind, "removed");
    assert.ok(!existsSync(wt.path));
    assert.ok(branches(repo).includes("exit-clean"));
  });

  it("keeps a dirty worktree when a Pi child exits on its own", async () => {
    const { wt, sessionFile, running, watch } = await setup("exit-dirty");
    writeFileSync(join(wt.path, "work.txt"), "uncommitted\n");
    writeFileSync(`${sessionFile}.exit`, JSON.stringify({ type: "done" }));

    await watch();

    assert.equal(running.worktreeRelease?.kind, "kept-dirty");
    assert.ok(existsSync(join(wt.path, "work.txt")));
  });

  it("removes a clean worktree when a Pi child exits with an agent error", async () => {
    const { wt, sessionFile, running, watch } = await setup("exit-error");
    writeFileSync(
      `${sessionFile}.exit`,
      JSON.stringify({ type: "error", errorMessage: "model refused" }),
    );

    const result = await watch();

    assert.equal(result.exitCode, 1);
    assert.equal(running.worktreeRelease?.kind, "removed");
    assert.ok(!existsSync(wt.path));
  });

  it("removes a clean worktree when a Claude child writes its sentinel", async () => {
    const dir = realpathSync(mkdtempSync(join(tmpdir(), "subagent-wt-claude-")));
    tempDirs.push(dir);
    const sentinelFile = join(dir, "sentinel");
    writeFileSync(sentinelFile, "claude summary\n");
    const { wt, running, watch } = await setup("exit-claude", { cli: "claude", sentinelFile });

    const result = await watch();

    assert.equal(result.summary, "claude summary");
    assert.equal(running.worktreeRelease?.kind, "removed");
    assert.ok(!existsSync(wt.path));
  });

  it("removes a clean worktree when the watch is cancelled", async () => {
    const { __test__, wt, running, watch } = await setup("exit-cancel");
    const controller = new AbortController();
    controller.abort();

    const result = await watch(controller.signal);

    assert.equal(result.summary, "Subagent cancelled.");
    assert.equal(__test__.runningSubagents.has(running.id), false);
    assert.equal(running.worktreeRelease?.kind, "removed");
    assert.ok(!existsSync(wt.path));
  });

  it("does not release again when the watcher exits after subagent_close", async () => {
    const { __test__, wt, running, watch } = await setup("close-then-exit");

    // The child is mid-turn while its watcher runs, so the orchestrator forces it.
    const closed = __test__.closeSubagentByName({ name: running.name, force: true });
    const release = running.worktreeRelease;
    assert.ok("worktree" in closed.details);
    assert.equal(closed.details.worktree?.kind, "removed");
    // Something else puts a worktree back at that path before the watcher
    // notices the exit. The watcher must not remove it on the strength of
    // the earlier close.
    reattachSubagentWorktree(wt);
    writeFileSync(`${running.sessionFile}.exit`, JSON.stringify({ type: "done" }));

    await watch();

    assert.equal(running.worktreeRelease, release);
    assert.ok(existsSync(wt.path));
  });
});
