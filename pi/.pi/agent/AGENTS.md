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
