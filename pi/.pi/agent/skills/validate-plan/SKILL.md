---
name: validate-plan
description: Validate an implementation against its plan file. Reports which tasks are done, partially done, or missing, runs each task's automated verification commands, lists the manual verification the user still has to do, and flags deviations from the plan. Read-only; never edits code. Use after an implementation, or when the user says "validate the plan", "check the plan against the code", "did we finish the plan", "verify the implementation", or "what's left in the plan".
---

# Validate plan

Check that a plan was carried out as written. This is a conformance check: it compares the code to the plan, runs the plan's own verification commands, and reports gaps. It is not a code review and not a fix-up pass.

**Read-only.** Never edit, create, or delete source files. Never commit or push. Never tick checkboxes in the plan. If something is broken, report it; the user decides what to do.

## 1. Find the plan

- If the user gave a path, use it.
- Otherwise look for the newest plan in `docs/plans/` (`fffind` with `docs/plans .md`).
- If several candidates fit, ask which one. Do not guess.

Read the whole plan yourself. Do not delegate reading it.

## 2. Extract what the plan promises

From the plan, list:

- Every `## Task N: <title>` with its **Files owned**, **Depends on**, **Steps**, **Automated verification**, and **Manual verification** lines.
- The `## Overview` checklist (`- [ ]` / `- [x]`), if present. A ticked box is a claim to verify, not proof.
- The `## What we're NOT doing` list. Work that shows up there is a deviation.

Older plans may use a single **Acceptance criteria** line instead of the automated/manual split. Treat runnable commands in it as automated and everything else as manual.

## 3. Gather evidence of what changed

Run these yourself (read-only git commands only):

```bash
git status --short
git diff --stat            # uncommitted work
git log --oneline -n 20    # recent commits
git diff --stat <base>...HEAD   # committed work, where <base> is main or the branch point
```

## 4. Check tasks in parallel

Spawn read-only subagents so the checks run side by side and keep your context small. Use the `subagent` tool with these profiles:

- `locator`: find where a task's work landed when the files owned are vague or were renamed.
- `analyzer`: confirm a task's steps are actually implemented, with `file:line` evidence.
- `explore`: fallback for broader questions.

Give each subagent one task (or a few small related tasks) and pass the task text from the plan as `context`, since subagents cannot see this conversation. Example:

```ts
subagent({
  name: "validate-task-3",
  profile: "analyzer",
  task: "Compare the code to Task 3 of the plan. For each step, say whether it is implemented, with file:line evidence, or missing. Note anything implemented differently from what the step describes. Describe only; do not suggest fixes.",
  context: "<paste Task 3 from the plan, plus the files owned>",
})
```

Wait for every subagent to finish before you write the report. Check their evidence; treat claims without `file:line` references as unconfirmed.

## 5. Run automated verification

Run each task's **Automated verification** commands yourself, from the repo root unless the plan says otherwise. Record the exact command and pass or fail, with the relevant lines of output for failures.

- Run only commands that verify: tests, builds, typechecks, linters, read-only scripts.
- Do not run commands that change state: migrations, deploys, formatters that rewrite files, package installs, `--fix` flags, anything that pushes. List those as "not run" and say why.
- If a command fails, read enough to say which task it belongs to and what failed. Do not fix it.

## 6. Classify each task

- **Done**: every step is present and its automated verification passes.
- **Partial**: some steps are present, or the code is there but verification fails.
- **Missing**: no evidence the task was started.

Separately, list **deviations**: code that differs from what the plan describes, files changed that no task owns, work that falls under "What we're NOT doing", and dependency order that was broken.

## 7. Report

```markdown
## Validation: <plan file>

### Task status
- Task 1: <title>: Done
- Task 2: <title>: Partial. <what is missing or failing, file:line>
- Task 3: <title>: Missing

### Automated verification
- PASS `bun test test/*.test.ts` (Task 1)
- FAIL `npm run typecheck` (Task 2): `src/foo.ts:42 Type 'string' is not assignable...`
- NOT RUN `npm run migrate` (Task 4): changes state

### Manual verification for you
- [ ] Task 2: open the settings page and confirm the toggle persists after reload
- [ ] Task 4: none listed

### Deviations from the plan
- `src/bar.ts:10-30` implements caching, which the plan lists under "What we're NOT doing"
- `src/baz.ts` changed but no task owns it

### Unconfirmed
- Anything you could not verify, and where you looked
```

Then end with the standard headings:

## Blocked on me
Manual verification steps, plus any decision the user needs to make (for example, keep or revert a deviation). "None" if nothing.

## Changed
None. This skill is read-only.

## Found
Failing checks, partial or missing tasks, deviations, and suggested next steps (for example, implement the missing tasks).

## Rules

- Run every automated check the plan lists, unless it changes state. Do not skip checks because the code looks right.
- Report what you saw. Do not soften failures or mark a task done on the strength of a ticked checkbox.
- Keep scope to the plan. Unrelated issues go under Found in one line each, if at all.

---

_Adapted from `.claude/commands/validate_plan.md` in humanlayer/humanlayer (Apache-2.0, Copyright (c) 2024 humanlayer Authors). Modified for Pi: plan format, subagent profiles, read-only rules, and report headings changed. See `LICENSE`._
