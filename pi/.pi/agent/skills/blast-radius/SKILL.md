---
name: blast-radius
description: Find what a change could break outside its diff before it ships, and prove the one fact its safety depends on by running real code instead of writing it up. Use for "blast radius of X", "what could this break", "is this safe to merge", or reviewing a small diff you don't trust. Skip for a full code review of style and correctness inside the diff.
metadata:
  source: "cursor_plugins/pstack/skills/blast-radius (Lauren Tan, pstack)"
  license: "MIT, Copyright (c) 2026 Lauren Tan. See LICENSE."
---

# Blast radius

Find what a change breaks somewhere else, before it ships.

Listing the callers is not the job. `ffgrep` finds those in a second. The job is the breakage a text search won't show you.

## Don't trust your own writeup

A blast-radius writeup that sounds right is worthless. It reads as convincing whether or not it's true. So don't hand back the writeup alone. Find the one or two facts the whole thing depends on and prove them by running code.

### How sure are you

For each fact the change's safety depends on, push it as far down this list as is cheap, and say where it stopped.

1. You said so. Worthless on its own.
2. You pointed at the line. A real `file:line`, or the library's own source.
3. You showed the bad case can't happen. You walked the failure step by step and it doesn't reach.
4. You ran it. A script or test that calls the real code and fails loud if you're wrong.
5. You reproduced it in the running app.

Step 4 is usually one small script that imports the same library the app ships and calls the exact function you're worried about.

## Steps

1. **Read the change.** Read the diff, the symbols it adds, changes, and deletes, and what it now does differently, including the part the diff doesn't spell out. Pull the PR and its history with `gh pr view`, `gh pr diff`, and `git log -p` on the touched files.
2. **Find the one fact it's safe because of.** Most changes that look risky are safe because of a single fact, like "this call only drops already-dead cache entries and does nothing else". Find that fact. If it holds, most risky cases clear at once. Spend your time here, not on a long list of maybes.
3. **Look where text search stops.** Read the source of the library you call, and check its pinned version and any local patch. Work out when things run: microtasks, unmount and teardown, framework render order. Follow what a symbol search misses: the JSON an API returns, a DB column, a wire format, another language reading the same bytes, a feature flag, code three hops downstream. `symbol_search` and `module_report` with `blastRadius` give a starting list of dependents, not the answer.
4. **Be honest about each risk.** Give it a real chance of happening and a real cost if it does. Keep the risks you confirmed. List the ones you checked and cleared separately. Cite a real `file:line`. A search that finds nothing is still an answer. Never make up a caller or an API.
5. **Prove the one fact.** Write a script or test that runs the real code, run it, and paste what happened.
6. **Get a second opinion on a big or wide change.** Spawn two or more `review` subagents with the same question, on different models when you can (pass `model` to the `subagent` tool), and merge their answers. Different models catch different real bugs.

## What to hand back

- **What it does.** What changed, including the part that isn't obvious.
- **The one fact it's safe because of.** State it, say which step of the ladder you got it to, and show the proof. If you couldn't prove it, write "unproven".
- **Risks.** Each names how it breaks, the `file:line`, how likely and how bad, and how to check. Paste the proof for the ones that matter.
- **Cleared.** What you checked and why it's fine.
- **Before you merge.** The cheapest test or repro that catches the real bug, including the script you wrote.

Write it through `unslop`, cite real code, and strip anything private before it goes anywhere public.

**Reply:** the writeup above, with the one safety fact either proven or marked unproven.
