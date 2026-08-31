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

## Import Paths — Prefer Alias Paths
- **Prefer path aliases over relative imports** when the project has one configured (e.g. `@/*` → `./app/*`). Check `tsconfig.json` `compilerOptions.paths`.
- Use `@/components/...`, `@/lib/...`, `@/routes/...` — NOT `../../components/...`.
- Intra-module siblings (same feature folder, e.g. `./sidebar-nav` inside a `components/` dir) may stay relative — the rule targets cross-directory imports where `@/` is clearer.
- If no alias is configured, use relative paths as normal.

## Tool Usage — Prefer FFF over bash grep/find
- **NEVER use `grep` or `find` via the `bash` tool.** Use `ffgrep` for content search and `fffind` for file/path search instead.
- `ffgrep` and `fffind` are faster (Rust SIMD), frecency-ranked, git-aware, and context-window friendly.
- Only fall back to `bash` grep/find if ffgrep/fffind are unavailable or the query needs shell pipes/complex processing.
