---
name: systematic-debugging
description: Find the root cause of a bug, failing test, build failure, or surprising behavior before changing any code. Reproduce it, check what changed, find where good data turns bad, and test one hypothesis at a time. Use when the cause isn't proven yet, a guessed fix already failed, a test is flaky or only fails in the suite, or the failure crosses components. Skip when the error already names the cause; once the cause is known, use tdd for the regression test.
metadata:
  source: "obra/superpowers v7.0.0 skills/systematic-debugging (Jesse Vincent)"
  license: "MIT, Copyright (c) 2025 Jesse Vincent. See LICENSE."
---

# Systematic debugging

Find out why it breaks before you change anything. A fix you can't explain is a guess, and a guess that seems to work hides the real cause until it comes back somewhere else.

Match the effort to the bug. If the stack trace points at a typo, fix the typo. Use the full process when the cause isn't obvious, when a fix you were sure of didn't work, or when you catch yourself about to "just try" something.

## 1. Investigate

Do all of this before proposing a fix.

1. **Read the whole error.** Read the full stack trace, every warning above it, the exit code, and the exact file and line. The answer is often already printed.
2. **Reproduce it.** Find the exact command or steps and run them. Note whether it fails every time. If it doesn't fail reliably, read `references/flaky-tests.md` before going further.
3. **Check what changed.** Run `git log -p` and `git diff` on the files involved, and check recent dependency, lockfile, config, and environment changes. "It worked yesterday" means something changed since yesterday.
4. **Find the layer that breaks.** When data passes through several components (CI to build script to signing, UI to API to database), log what enters and leaves each boundary and run once. The output shows which hop loses or corrupts the value. Investigate only that component.
5. **Trace the bad value back.** When the error surfaces deep in a call stack, the bug is usually higher up. Follow the bad value to where it first went wrong. See `references/root-cause-tracing.md`.

## 2. Compare with working code

1. Find something similar in the same codebase that works.
2. If you're following a pattern or library example, read the reference in full, not the first screen of it.
3. List every difference between the working and broken versions, including ones that look irrelevant. Don't rule a difference out until you've checked it.
4. Note what the broken code depends on: config, environment variables, call order, versions.

## 3. Test one hypothesis

1. Write it down: "X is the cause because Y." Make it specific enough to be wrong.
2. Make the smallest change that would confirm or kill it. Change one variable at a time.
3. If it's wrong, undo the change and form a new hypothesis from what you learned. Don't stack a second change on the first.
4. If you don't understand something, say so. Read the source, add logging, or ask the user. Don't paper over it.

## 4. Fix the cause

1. **Capture it in a test first** when there's a cheap test path. Use the `tdd` skill. If there isn't one, write a short script that reproduces the failure and keep it until the fix is verified.
2. **Make one fix at the source.** No "while I'm here" changes or bundled refactors. A guard where the error appears is a symptom fix unless the value really can arrive there legitimately.
3. **Verify.** Rerun the reproduction, then the surrounding suite. For a flaky failure, one green run proves nothing. Rerun the exact failing order as `references/flaky-tests.md` describes.
4. **Check for the same mistake elsewhere** if the cause is a pattern rather than a one-off. Use `blast-radius` before shipping a risky fix, and `correct` if the same class of mistake keeps coming back.

## When fixes keep failing

Count your fix attempts. After three that didn't hold, stop. Three failures usually mean the design is wrong, not that you haven't found the right patch yet. Watch for these signs:

- each fix exposes a new problem in a different place
- the next fix needs a large refactor to land
- fixing one symptom creates another

Tell the user what you tried, what each attempt showed, and which design assumption you now doubt. Ask before trying a fourth fix.

## Signs you skipped a step

- You're about to change something to "see if it helps".
- You're making two changes before rerunning.
- You can't say why the fix works.
- You're listing fixes without having reproduced the bug.
- The user asks "is that actually happening?" or "stop guessing".

Go back to step 1 when you notice any of these.

## When there's no code fault

Sometimes the cause really is outside the code: a slow external service, a timing dependency, a broken environment. Say what you checked to reach that conclusion. Then add handling that fits it (a retry with a limit, a timeout, a clear error message) and logging that would show the cause next time. Most "it's just flaky" verdicts turn out to be an investigation that stopped early, so be sure before you settle on this one.

## What to hand back

- The root cause in one or two sentences, with `file:line`.
- The evidence: the command you ran and what it printed, or the log lines that show the break.
- The fix, and why it addresses the cause rather than the symptom.
- How you verified it, with the commands and their results.
- Anything you suspected but couldn't confirm.
