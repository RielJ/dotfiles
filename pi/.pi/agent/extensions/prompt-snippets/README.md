# Prompt snippets

Mix-and-match single-purpose prompt rules, toggled per message.

Vendored from [amosblomqvist/pi-config](https://github.com/amosblomqvist/pi-config), used under the MIT License. Local changes: subagent-oriented snippets rewritten for this configuration's `subagent` tool and profiles, plus a `plan-first` snippet.

## Usage

Press `alt+s` or run `/snippets`. In the menu: `space` toggles, `tab` previews, `enter` applies, `esc` cancels. Active snippets show in a widget above the editor and are prepended or appended to the next message you send. Toggles reset after each send and at session start, so a snippet costs tokens only on the turn you enable it.

## Snippets

| Snippet | Placement | Effect |
|---|---|---|
| Session kickoff | prepend | Get oriented and report back before starting work |
| Orchestrator mode | prepend | Delegate mechanical work to subagent profiles |
| Ask questions | append | Ask until the goal is unambiguous, then wait |
| Verify, don't assume | append | Check facts instead of guessing |
| Plan first | append | Reviewable plan before edits, `plan_multi` when contested |
| Delegate exploration | append | Targeted `explore` subagents instead of wide reads |
| Diagnose, don't fix | append | Read-only investigation and a proposed fix |

## Adding a snippet

Drop a markdown file in `snippets/`:

```markdown
---
name: Tight diffs
description: Smallest change that solves the problem
placement: append
order: 50
---
Make the smallest change that solves the problem. No drive-by refactors.
```

`placement` is `prepend` or `append`; `order` sorts within its group. Files are re-read when the menu opens and when a message is sent, so a new snippet needs no restart.
