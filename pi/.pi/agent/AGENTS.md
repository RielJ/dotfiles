# Global Rules

## Git Safety — ABSOLUTE RULES
- **NEVER force push.** Do not use `git push --force`, `git push -f`, or `git push --force-with-lease`. No exceptions.
- **NEVER amend pushed commits.** Do not use `git commit --amend` on commits that have already been pushed. Make a new commit instead.
- **NEVER rewrite pushed history.** No `git rebase` on pushed branches, no `git filter-branch`, no `git reset --hard` on pushed commits.
- If you need to undo a pushed commit, use `git revert` to create a new commit that reverses the changes.

## Git Workflow — NEVER AUTO-COMMIT OR AUTO-PUSH
- **NEVER run `git commit` on your own.** Only commit when the user explicitly asks (e.g. `/commit`, "commit this", "please commit").
- **NEVER run `git push` on your own.** Only push when the user explicitly asks (e.g. `/pr`, "push this", "please push").
- You may stage files with `git add` while working, but do NOT commit or push without explicit user confirmation.
- When work is done, tell the user what changed and let them decide when to commit/push.

## Autonomy
- When a step doesn't need user input, keep going. Put status notes in the same message as the next action.
- Stop and ask only when you cannot continue without the user, or before anything destructive: deleting data, force-pushing, or changing anything outside the current repository that the user did not ask you to change.

<important if="you are about to change code, config, or other files">
- Start read-only. Read the spec or task and the relevant code, identify existing patterns and conventions, map dependencies between components, and note risks and unknowns.
- Break multi-step work into small, verifiable tasks, each with explicit acceptance criteria. Track them in the task list and record dependencies with `blockedBy`.
- Work in thin vertical slices: implement the smallest complete piece, test it (write a test if none exists), verify it (tests pass, build succeeds, manual check where relevant), then move on. Carry work forward; don't restart.
- Never implement an entire feature in one pass. After each slice the project must build and existing tests must pass.
- Slices are not commits. Leave changes uncommitted (staging is fine) and report them.
</important>

<important if="you are spawning subagents, worktree agents, or running a plan with parallel builders">
- Give each subagent, builder, or worktree a separate set of files. Two parallel tasks must never own the same file.
- Safe to parallelize: independent feature slices, tests for features that already exist, documentation.
- Run sequentially: database migrations, shared state changes, dependency chains.
- Coordinate first: features that share an API contract. Define the contract in its own task, then parallelize the consumers.
- Wait for delegated tasks to finish before building on their results.
</important>

<important if="a subagent, worktree agent, or plan builder has reported back">
- Check its evidence (diff, command output, test results) before accepting the result. Treat claims without evidence as unconfirmed.
- Subagents stay open after reporting. If the work is incomplete, send follow-up instructions with `subagent_message`. Once you accept the result, close it with `subagent_close`.
</important>

<important if="you are reviewing code, a diff, a branch, or a PR">
- Report only problems you would block the merge for. For each one, give the file and line, why it is wrong, and how to show it fails (a test, an input, or a command).
- List anything you could not confirm and say where you looked.
</important>

<important if="you finished a run that changed files or delegated work">
- End with three headings: `Blocked on me`, `Changed`, `Found`. Write "None" under a heading with nothing to report. Plain questions don't need them.
</important>

<important if="you are adding or modifying imports in a TypeScript or JavaScript project">
- Prefer path aliases over relative imports when the project has one configured (check `tsconfig.json` `compilerOptions.paths`, e.g. `@/*` → `./app/*`). Use `@/components/...`, not `../../components/...`.
- Siblings in the same feature folder (e.g. `./sidebar-nav` inside a `components/` dir) may stay relative. If no alias is configured, use relative paths.
</important>

<important if="you are searching file contents or file paths">
- Use `ffgrep` for content search and `fffind` for path search. Never run `grep` or `find` through `bash`.
- Fall back to `bash` grep/find only if ffgrep/fffind are unavailable or the query needs shell pipes.
</important>

<important if="the user corrects a mistake you or another agent made, or you see the same mistake twice">
- Fix the mistake, then fix the class of mistake at the highest level that works: architecture, then types, then a lint/hook/test, and only last a rule in this file. See the `correct` skill.
- Keep the table below current. A rule enforced only by "text" that gets broken again is a repeat: add an enforcer in the same change.

| Rule | Enforced by |
|---|---|
| No force push, `--amend`, `filter-branch`, `reset --hard` | `extensions/damage-control` (`hard: true` rules in `damage-control-rules.yaml`: blocked, no prompt) |
| Other risky commands and protected paths (rm -r outside temp, `pkill -f`, secrets, read-only paths) | `extensions/damage-control`: Block/Allow once prompt; no answer in 2 min blocks |
| No `git commit` / `git push` unless asked | text only; `/commit` and `/pr` ask for confirmation |
| ffgrep/fffind instead of grep/find | text only |
| Prefer `@/` alias imports | text only (project lint where configured) |
| Only fnm's Node on PATH | zsh `brew` wrapper unlinks Homebrew's `node` (`zsh-aliases.zsh`) |
</important>
