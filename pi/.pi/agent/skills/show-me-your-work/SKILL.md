---
name: show-me-your-work
description: Keep a reviewable decision trail for long-running or unattended work. Appends one row per decision (what, why, evidence, result) to a local TSV log, audits the log against the session before handing back, and gets a review from a subagent on a different model. Use for /skill:show-me-your-work, autonomous or multi-phase runs, big ports or migrations, or work the user reviews after stepping away. Skip for short tasks the user watches live.
metadata:
  source: "cursor_plugins/pstack/skills/show-me-your-work (Lauren Tan, pstack)"
  license: "MIT, Copyright (c) 2026 Lauren Tan. See LICENSE."
---

# Show me your work

Keep one canonical log.

## The format

A single TSV file, one row per decision. Cells stay on one line. Evidence is a pointer, not prose.

Copy `references/decision-log-template.tsv` (the header row) to start a clean log. Columns:

- **ts.** ISO 8601 timestamp.
- **phase.** The phase or workstream.
- **decision.** What was chosen or done, one line.
- **why.** The reason in plain words. If a principle drove it, say so plainly, not as a jargon tag.
- **evidence.** A link or path that proves it: a commit SHA, a PR number, a `file:line`, or an artifact, trace, or screenshot path. Never a paragraph.
- **result.** The outcome or state: `tests green`, `reverted`, `pixel-diff 0`, `INCONCLUSIVE`, `open`.

An example, plain-spoken so a reviewer reads it at a glance:

```tsv
ts	phase	decision	why	evidence	result
2026-05-24T09:02:00Z	frame	counted the work first, about 100 components and roughly 75 hours	wanted to know the size before starting a long run	scripts/count.sh output	found 5 things to sort out before starting
2026-05-24T09:40:00Z	harness	took screenshots of the old version before changing anything	so we can compare old against new and catch any visual change	scripts/snapshot.sh, baseline/	saved 120 reference screenshots
2026-05-24T11:15:00Z	widget	moved the widget styles over without changing how it looks	keep the change small and the result identical	src/widget.css, pixel-diff 0	looks identical, tests pass
2026-05-24T12:30:00Z	widget	threw out a helper's work because its screenshots were blank	checked the real files instead of trusting its summary	worktree reset	reverted, tightened the instructions for next time
```

## Logging a row

Write each entry the way you'd tell a teammate what you did. Plain words, concrete actions, no jargon. The `unslop` skill applies to log text too.

Use the helper: `scripts/log.sh <logfile> <phase> <decision> <why> <evidence> <result>`. It stamps `ts`, writes the header on first use, strips stray tabs and newlines, and prefixes any cell that starts with `=`, `+`, `-`, or `@` with a single quote so a spreadsheet won't run it as a formula. A bare `printf` that appends a row works too, but handle those same characters if cells come from generated or user-supplied text.

Log decision points and checkpoints, not every action: a fork chosen, a unit completed with its verification result, a pivot or revert with its trigger, a blocker surfaced, a gate fixed. For loop runs, log one row per iteration. Skip the trivial and self-evident.

A run is one agent session, including its later turns and any compaction of it. A pickup, a replacement agent, or a new session starts a new run. When a run adds to a log that already has rows, its first row has phase `start`, and so does its first row after another run's `start` row. So a run that comes back to a log in a later turn first reads the log's last rows to see whether another run wrote since. A `start` row names the `ts` range of the earlier rows this run did not write, and its evidence names this run, such as its session id. Use phase `start` for nothing else.

## Where it lives

The log is a local working artifact. Keep it at `.pi/decision-log.tsv` in the project, or `.pi/decision-logs/<task-slug>.tsv` when several efforts run at once. Leave it out of version control. If `.pi/` isn't already ignored, tell the user instead of editing `.gitignore` yourself.

## Rules

- Append-only. A wrong call gets a new row that supersedes it. Never edit or delete history.
- Prefer evidence produced by scripts kept in the repo over hand-made one-offs. See `principles` (`references/encode-lessons-in-structure.md` and `references/prove-it-works.md`).

## Audit the log against the session

At the end of the run, before you hand back, check that the log told the truth. Use `vcc_recall` to search this session's history, including turns that were compacted away. Read only this session. Don't open other session files under `~/.pi/agent/sessions/`, since those hold unrelated private chats.

Walk this run's rows against what happened. Each stretch of them begins at one of this run's `start` rows, or at the first row if this run created the log, and ends at the next `start` row of another run:

- Check that every row maps to a real decision or action.
- Check that each row's evidence resolves and shows what the row claims.
- A fork, pivot, or abandoned approach that shaped the work but isn't logged is a gap. Add it.

Correct the log, not the story. The audit never edits or removes a row, even an invented one. When a row records neither a real decision nor a real action, or its claim or evidence is wrong, add a row that supersedes it with what happened and a pointer that resolves. The audit doesn't check rows outside this run's stretches. If this run's own work shows one of them is wrong, supersede it like any wrong call.

## Cross-model review of the trail

Before you hand back, spawn a `review` subagent with the `subagent` tool and pass a `model` from a different model family than the one that did the work. Self-review is not a substitute. The subagent can't see this conversation, so pass it the log path and a digest of the session from `vcc_recall`. It flags what the user should pay attention to. It doesn't redo the work. It scans for what is suboptimal or risky:

- Decisions logged with weak or missing evidence.
- Verification steps skipped, or claimed without proof in the session.
- Choices that look risky in hindsight: premature, scope-creeping, or covering a symptom.
- Gaps the user would otherwise miss on a quick skim.

If no other model family is available, say so in the reply instead of skipping the review silently.

## Reviewing the trail

Read top to bottom, follow the evidence pointers, and spot-check. `column -s$'\t' -t .pi/decision-log.tsv` renders the log as a table in a terminal.

## Composing this skill

Other skills route their audit trail here instead of inventing one. Reference this skill by name and let it own the format. Don't restate the columns.

**Reply:** every reply for a run that produced a trail ends with an "Attention" section. Lead with the reviewer's model on its own line (`reviewed by <model>`), then list each flag with the rows or moments it points to. "No flags" is a valid value. The model name is not optional.
