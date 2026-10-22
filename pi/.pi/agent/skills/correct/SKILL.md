---
name: correct
description: Find the mistakes agents keep repeating in this repo and make each one impossible. Tries architecture first, then types, then a lint whose error names the fix, then a test, and writes AGENTS.md rules last. Proves each new check fails on a real past mistake. Use for /skill:correct, "stop making this mistake", "agents keep doing X", or after the user corrects the same thing twice. Skip for a one-off correction with no pattern behind it.
metadata:
  source: "cursor_plugins/pstack/skills/correct (Lauren Tan, pstack)"
  license: "MIT, Copyright (c) 2026 Lauren Tan. See LICENSE."
---

# Correct

The user keeps correcting agents in this repo for the same mistakes. Change the repo so the next agent can't make them.

Assume every contributor is an agent that sees only the files it opened, copies the nearest example, and takes the shortest path that compiles. Design the repo so a change that looks right from one file is right for the whole repo.

## Find the mistake classes

First, read recent commits (`git log -p`), reverts, review comments, `AGENTS.md`, and comments that explain workarounds. Use `vcc_recall` to search past sessions for corrections the user made. Use `ffgrep` to find other instances of each mistake. Group the mistakes into classes. A class counts once it has happened twice.

## Fix each class at the highest level that works

1. **Eliminate it with architecture.** Give each piece of state one owner and each task one supported way. Hide internals so the wrong import fails. Replace hand-synced lists with one source of truth. Delete old ways and dead code an agent would copy.
2. **Enforce it with types so the bad state can't be written.** If bad code still compiles, add a lint or CI check whose error names the file, type, or function to use instead. If the pattern is already common, fail only when a change adds more.
3. **Test the behavior.** Fix or delete any test that would still pass if every function it calls returned nothing. See `principles` (`references/test-behavior-not-implementation.md`).
4. **Write docs or `AGENTS.md` rules last, only for judgment calls.** Nothing fails when an agent skips them.

`principles` (`references/encode-lessons-in-structure.md`) explains why a mechanism beats an instruction.

## Fix and prove

Fix the most frequent classes now, one self-contained change each. Prove each new check fails on a real past mistake: reintroduce the mistake, run the check, paste the failure, then revert the reintroduction. Run the same command locally and in CI. Exceptions go on the offending line with a reason, an expiry date, and a human's approval.

Leave the changes uncommitted. The user decides when to commit.

## Keep the rule table

Last, keep a table in `AGENTS.md` that pairs each rule with what enforces it (a type, a lint rule, a test, or "judgment only"). When the user corrects you, fix the mistake and add the rule. If the rule was already there and nothing enforces it, that's a repeat, so fix it at the highest level in the same change. Drop a rule once its mistake can't happen.

**Reply:** each class with its evidence, the level you picked, and why a higher level didn't work.
