---
name: handoff
description: Create or resume a handoff document that carries work across sessions. Create mode writes .pi/handoffs/<YYYY-MM-DD_HH-MM>_<slug>.md in the current repo with tasks, critical references, recent changes (file:line), learnings, artifacts, and next steps. Resume mode reads the newest or a named handoff, checks the repo's current state against it with git status/diff and quick checks, and proposes next steps. Use when the user says "write a handoff", "hand this off", "save context for the next session", "I'm out of context", "resume the handoff", "pick up where we left off", or "continue from the last session".
---

# Handoff

A handoff is a short document that lets a fresh session continue your work without the old conversation. It compresses context; it does not replace reading the code.

Pick the mode from the request:

- **Create**: "write a handoff", "hand this off", "save context", or the session is running out of context.
- **Resume**: "resume", "pick up where we left off", or the user names a handoff file.

`vcc_recall` complements a handoff. It searches past session history, so use it to recover a decision or discussion the handoff left out. The handoff is the curated summary; `vcc_recall` is the raw record.

## Create

### 1. Pick the path

Write to `.pi/handoffs/<YYYY-MM-DD_HH-MM>_<slug>.md` at the repo root (`git rev-parse --show-toplevel`; use the cwd if it is not a git repo).

- Timestamp is local time, 24-hour: `date +%Y-%m-%d_%H-%M`.
- Slug is a short kebab-case description of the work, such as `oauth-refresh-retry`.
- Create `.pi/handoffs/` if it does not exist.

Collect metadata with read-only commands:

```bash
date -Iseconds
git rev-parse --show-toplevel
git branch --show-current
git rev-parse --short HEAD
git status --short
git diff --stat
```

### 2. Write the document

```markdown
---
date: <ISO timestamp with timezone>
repo: <repo name>
branch: <branch>
commit: <short hash>
topic: <one line>
status: <in progress | blocked | done>
---

# Handoff: <short description>

## Tasks
Each task with its status: done, in progress, or planned. If you are working from a plan, name the plan file and which `## Task N` you are on.

## Critical references
The 2-3 documents or files the next session must read first: plan, spec, key design note. Leave empty if none.

## Recent changes
What you changed, as `path/to/file.ts:12-40` references with one line each. Say which changes are uncommitted.

## Learnings
What the next session needs to know and would otherwise rediscover: root causes, gotchas, patterns the code follows, commands that work, approaches that failed and why. Use file paths.

## Artifacts
Every file you produced or updated that the next session should read: plans, notes, scripts, test fixtures. Paths or `file:line`.

## Next steps
Ordered list of what to do next, specific enough to act on. Include the command to verify each step where you know it.
```

Guidelines:

- Include more detail rather than less, but keep it tight. A good handoff fits on one or two screens.
- Prefer `file:line` references over code. Include a short snippet only when it matters, such as the exact error you are chasing.
- Record failed attempts. They save the next session the most time.
- Write the state as it actually is. If tests are failing, say so.

### 3. Tell the user

Reply with the path and how to resume:

```
Handoff written to .pi/handoffs/2026-10-09_14-30_oauth-refresh-retry.md
Resume in a new session with: "resume the handoff" (or name the file).
```

Do not commit the handoff or anything else. The user decides what to commit.

## Resume

### 1. Find the handoff

- If the user named a file, use it.
- Otherwise list `.pi/handoffs/` at the repo root and take the newest. The `YYYY-MM-DD_HH-MM` prefix sorts by time. `ls .pi/handoffs/ | sort | tail -5` shows the latest.
- If the directory is missing or empty, say so and ask for a path.
- If several recent handoffs look like separate threads of work, list them and ask which one.

### 2. Read it and its references

Read the whole handoff yourself. Then read the files under Critical references and any plan it names. Do not delegate these reads; they are the context you need.

Skim the files under Recent changes and Learnings. For a large set, you can spawn read-only subagents (`subagent` with profile `analyzer` or `explore`) to check specific claims in parallel, passing the relevant handoff text as `context`.

### 3. Check the current state

Never assume the repo matches the handoff. Run:

```bash
git branch --show-current
git log --oneline -n 10
git status --short
git diff --stat
```

Then compare to the handoff:

- Same branch? Has `HEAD` moved past the recorded commit (`git log <commit>..HEAD --oneline`)?
- Are the Recent changes still present at the cited `file:line` locations? Use `ffgrep` or `read` to spot-check.
- Run one or two quick checks the handoff mentions, such as the failing test or the typecheck, to see whether the recorded state still holds. Keep them read-only and fast.

If a decision referenced in the handoff is unclear, search for it with `vcc_recall` before asking the user.

### 4. Report and propose

```markdown
## Resuming: <handoff file>

**Tasks**
- <task>: <status in handoff> → <status now>

**State check**
- Branch/commit: <matches | moved: N new commits>
- Recent changes: <present | missing | modified>, with file:line
- Quick checks: <command> → <result>

**Learnings that still apply**
- <learning>, `file:line`

**Proposed next steps**
1. <first step from the handoff, adjusted for current state>
2. ...

**Conflicts or surprises**
- <anything that diverged since the handoff>
```

Ask the user to confirm before you start. Then work through the next steps, applying the handoff's learnings. When you stop again, write a new handoff rather than editing the old one.

### Common situations

- **Clean continuation**: everything matches. Propose the handoff's next steps as written.
- **Diverged repo**: new commits or missing changes. Reconcile first, then adjust the steps.
- **Unfinished task**: a task is marked in progress. Finish it before starting new work.
- **Stale handoff**: much time or refactoring has passed. Re-check the approach before following it.

---

_Adapted from `.claude/commands/create_handoff.md` and `.claude/commands/resume_handoff.md` in humanlayer/humanlayer (Apache-2.0, Copyright (c) 2024 humanlayer Authors). Modified for Pi: merged into one skill, storage moved to `.pi/handoffs/`, sync, ticket, and commit steps removed, verification and `vcc_recall` added. See `LICENSE`._
