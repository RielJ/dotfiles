# Hybrid subagents extension implementation plan

## Goal

Build a new `extensions/subagents/` Pi extension inspired by `amosblomqvist/pi-interactive-subagents` while fitting this configuration's existing orchestration and worktree code.

The extension will run every subagent as a Pi process in its own tmux window inside one hidden `_pi-agents` tmux session. The parent session remains unchanged. Users can inspect an agent through a popup, dismiss the popup, and leave the agent running.

Subagents are named tasks rather than fixed personas. The spawning orchestrator chooses the task, curated context, stable name, optional capability profile, model, cwd, and isolation mode.

## Confirmed product decisions

- Tmux topology: one shared `_pi-agents` session, one named window per subagent.
- Default workspace: caller's cwd.
- Optional isolation: `isolation: "worktree"` delegates to the existing `WorktreeManager`; no raw worktree commands in the new extension.
- Default profile: `general`.
- Optional profiles: `general`, `explore`, `research`, `review`, and `implement`.
- Names describe tasks, not profiles. When omitted, derive a slug from the task and suffix collisions.
- The orchestrator owns context selection. `context` is a curated string passed alongside `task`; the child does not inherit the whole conversation by default.
- Existing `extensions/git-worktrees/` stays enabled and unchanged during evaluation.
- No automatic commit, merge, push, worktree removal, or shared-cwd rollback.
- Strict tool allowlists survive resume through a persisted loadout snapshot.
- No commit or push during implementation.

## Public interface

```ts
subagent({
  task: "Investigate OAuth refresh failures",
  context: "Relevant observations and constraints...",
  name: "oauth-refresh",
  profile: "research",
  isolation: "shared",
});
```

Tools:

- `subagent`: spawn asynchronously.
- `subagent_message`: steer a running agent or resume a finished agent by name.
- `subagent_list`: list profiles and running or resumable agents.
- `subagent_attach`: open an agent window in a tmux popup.
- `subagent_wait`: wait for selected agents to become idle or finish.
- `subagent_gather`: collect final summaries from selected agents.
- `subagent_stop`: stop a running agent without deleting its session.

Commands:

- `/subagent <task>`
- `/subagents`
- `/subagent-attach <name>`

## Architecture

Reuse the upstream lifecycle, activity, session, loadout, status, and question concepts. Replace its current-session split-pane transport with a pool transport compatible with the existing worktree extension's hidden-session model.

```text
Main Pi session
  |
  | tools, steer messages, popup attachment
  v
_pi-agents tmux session
  |-- oauth-refresh      profile=research   cwd=shared
  |-- login-review       profile=review     cwd=shared
  `-- token-fix          profile=implement  cwd=worktree
```

The new tmux transport keeps the upstream surface API where practical, but each `surface` is a `_pi-agents:<window>` target. It creates detached windows, sends commands, reads screen state, detects liveness, closes windows, and attaches via `tmux display-popup`.

The worktree adapter imports `WorktreeManager` and `resolveGitRoot` from `extensions/git-worktrees/src/worktree-manager.ts`. It only allocates and records the worktree. Existing worktree commands remain responsible for merge and cleanup.

## Implementation sections

### 1. Scaffold, attribution, and upstream baseline

Create `extensions/subagents/` with package metadata, TypeScript configuration, README, bundled profiles, tests, and an upstream attribution notice. Record the exact upstream commit from `/tmp/pi-interactive-subagents`.

Adapt only required upstream modules:

- `activity.ts`
- `session.ts`
- `status.ts`
- `subagent-done.ts`
- `tmux.ts`, substantially rewritten for `_pi-agents`
- selected lifecycle logic from `index.ts`
- child tools needed for safe bash and questions

Use `@earendil-works/pi-coding-agent` and `@earendil-works/pi-tui`. Do not copy Claude CLI plugin support or unrelated bundled agents.

Acceptance:

- Extension loads as a package.
- Attribution and MIT notice are present.
- No `@mariozechner` imports remain under `extensions/subagents/`.

### 2. Dedicated `_pi-agents` tmux transport

Implement a pool transport with these operations:

- ensure `_pi-agents` exists without changing the user's active session;
- create or replace a detached window for a stable agent name;
- start the Pi command in the requested cwd;
- send a steer message safely;
- inspect recent screen output and window liveness;
- stop one window;
- list pool windows;
- open a 95% popup attached to the selected window;
- never kill the whole pool during normal extension shutdown.

Use readiness files and environment markers similar to the existing `tmux-swap.ts`, but use subagent-specific names such as `PI_SUBAGENT_READY_FILE`.

Acceptance:

- Parent layout never gains a split.
- Multiple agents appear as windows in `_pi-agents`.
- Popup dismissal leaves the child running.
- Unit tests cover target construction, name sanitization, and command escaping. Live tmux tests are opt-in.

### 3. Profiles, context, and strict tool registry

Implement profile discovery with precedence:

1. project `.pi/agents/`;
2. global `~/.pi/agent/agents/` when compatible;
3. bundled extension profiles.

Bundle conservative profiles:

- `general`: normal coding tools; inherited parent model unless overridden;
- `explore`: read-only code navigation;
- `research`: web and QMD research, no writes;
- `review`: diffs, diagnostics, and read-only inspection;
- `implement`: read, edit, write, bash, and code diagnostics.

The public `profile` parameter is optional and defaults to `general`. Keep profile separate from stable agent name.

Build a default-deny tool registry. Every child launches with `--no-extensions`, exact `--tools`, and only dedicated extension entry paths required by its toolset. Verify loadable paths for fff, web search/read, QMD, and Pi Lens before enabling them. Unknown or unavailable requested tools fail clearly rather than broadening access.

Persist the exact model, thinking level, prompt mode, task, curated context, cwd, profile, tool allowlist, backing extension paths, and nested-spawn permissions in a versioned loadout snapshot.

Acceptance:

- Omitted profile resolves to `general`.
- Orchestrator-provided `name`, `task`, and `context` reach the child unchanged.
- Resume replays the same loadout even if profile files later change.
- Unknown tools fail closed.

### 4. Shared cwd and optional WorktreeManager isolation

Add `isolation: "shared" | "worktree"`, defaulting to `shared`.

Shared mode resolves an explicit relative cwd against the caller's cwd or uses the caller's cwd directly. It performs no git snapshot, rollback, branch, or cleanup operation. Tool documentation must warn that parallel writers should request worktree isolation.

Worktree mode:

1. verify the caller is in a git repository;
2. call `resolveGitRoot`;
3. allocate through `WorktreeManager.allocate(task, { slug, branch })`;
4. launch the child in `record.worktreePath`;
5. store worktree id, path, and branch in the subagent registry and loadout;
6. leave merge and removal to the existing worktree extension.

Check tmux availability before worktree allocation so a failed launch does not create an orphan unnecessarily.

Acceptance:

- Shared mode never calls worktree allocation.
- Worktree mode contains no raw `git worktree` command.
- Isolated agents appear in the existing worktree registry.
- No automatic commit, merge, push, or removal occurs.

### 5. Registry, spawn, steer, resume, and orchestration tools

Create a persistent parent-session registry mapping stable names to child session files, tmux windows, loadout snapshots, profile, cwd, isolation metadata, status, and timestamps. Use atomic writes and synchronous name reservation to avoid collisions during parallel spawns.

Rewrite the upstream entry point around the agreed interface. Spawn returns immediately after the child starts. Completion sends one steer message to the parent with the last assistant summary and session metadata.

`subagent_message`:

- sends to a live `_pi-agents` window when running;
- resumes a finished Pi session using its persisted loadout and same name;
- refuses legacy or corrupt sessions without a valid sandbox snapshot.

`subagent_wait` watches activity and liveness without polling through model turns. `subagent_gather` reads stored summaries and returns a compact combined report. `subagent_attach` opens the popup. `subagent_stop` stops only the target window and preserves resumable state.

Acceptance:

- Parallel calls reserve unique names deterministically.
- Live steer and finished-session resume use the same stable name.
- Wait and gather support selected names or all agents.
- Reload does not duplicate watchers or completion messages.

### 6. Activity widget and ask-question flow

Adapt upstream activity files and status classification for hidden windows. Show a compact parent widget containing name, profile, state, elapsed time, current tool/activity, and isolation marker.

A child `ask_question` call writes a pending question state and parks as `waiting`. The parent receives one actionable steer message naming the child. `subagent_message` supplies the answer and lets the child continue. Parallel questions remain independently addressable.

Timer and watcher handles must use reload-safe global symbols and abort controllers. Headless parent sessions skip UI calls but retain lifecycle and result delivery.

Acceptance:

- States include starting, active, waiting, stalled, finished, and failed.
- Questions wake the parent once and do not auto-exit the child.
- Answering by name clears the waiting state.
- `/reload` leaves one widget poller.

### 7. Verification, docs, and migration boundary

Add unit tests for profiles, loadouts, registry persistence, name allocation, tmux targets, isolation selection, command assembly, status transitions, questions, wait, and gather. Add opt-in integration tests for real tmux windows and a temporary git repository.

Document:

- the `_pi-agents` topology;
- the task-name versus profile distinction;
- curated context behavior;
- shared versus worktree isolation;
- tool allowlists;
- attach, steer, resume, wait, gather, and stop;
- coexistence with current `wt_*` tools;
- upstream attribution.

Run targeted TypeScript, test, and non-writing lint checks. Do not run repository-wide format commands that alter unrelated dirty files. Do not commit or push.

Acceptance:

- Targeted tests and typecheck pass.
- Existing `extensions/git-worktrees/` behavior remains intact.
- No unrelated dirty files are modified.
- Final report lists files changed and any deferred integrations.

## Implementation status

The fork lives in `extensions/subagents/` and is complete for the confirmed scope above.

Delivered in this pass:

- Pool transport in `tmux-pool.ts` and the upstream-shaped adapter in `tmux.ts`: one hidden `_pi-agents` session, one window per agent, popup attach that leaves the child running.
- Task-first spawn parameters: `task`, `context`, `name`, `profile`, `model`, `cwd`, `isolation`, and `branch`, with `agent` kept as a deprecated alias.
- Bundled profiles `general`, `explore`, `research`, `review`, and `implement` in `agents/`, mapped to this configuration's fff, Pi Lens, web, and QMD tools.
- Worktree isolation through `WorktreeManager` in `worktree-isolation.ts`, with no automatic commit, merge, push, or removal.
- `subagent_attach` tool plus `/subagent` and `/subagent-attach` commands.
- `PI_SUBAGENT_DEPTH` and `PI_SUBAGENT_ISOLATION` exported to children on both launch and resume.
- Tests in `test/core.test.ts`, run with `bun test`.

One upstream bug was found and fixed during verification. Liveness used `tmux display-message -t <window>`, which exits 0 and silently falls back to the session's current window. Every dead agent therefore looked alive, `pollForExit` never terminated, and a steer message could reach the wrong window. Liveness is now an exact match against the pool's window list, and `capturePane` returns empty for a missing window instead of another agent's screen.

Not yet exercised: a full live spawn of a child Pi process end to end. Transport, sandbox construction, profile loading, and lifecycle detection are covered by tests and direct tmux integration checks.

## Risks and mitigations

- Parallel shared-cwd writers can overwrite each other. Tool descriptions and profiles recommend worktree isolation for parallel implementation work.
- Loading broad aggregate extensions can grant hooks or tools not intended for children. Only dedicated, verified extension entry points may be loaded.
- A worktree can outlive a failed child launch. Check tmux first, report any allocated id on later failure, and never delete possible user work automatically.
- Long-running children can retain stale authentication. Each child is a normal Pi process using shared locked auth storage; resume launches a fresh process.
- Hidden tmux windows can become orphaned. Registry reconciliation marks missing windows finished and lists unknown pool windows without deleting them.
- Current repository has unrelated dirty files. All implementation work stays within the new extension and explicitly approved integration files.
