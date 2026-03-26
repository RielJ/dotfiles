# Global Rules

## Git Safety — ABSOLUTE RULES
- **NEVER force push.** Do not use `git push --force`, `git push -f`, or `git push --force-with-lease`. No exceptions.
- **NEVER amend pushed commits.** Do not use `git commit --amend` on commits that have already been pushed. Make a new commit instead.
- **NEVER rewrite pushed history.** No `git rebase` on pushed branches, no `git filter-branch`, no `git reset --hard` on pushed commits.
- If you need to undo a pushed commit, use `git revert` to create a new commit that reverses the changes.
