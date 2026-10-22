---
name: benchmark-optimization-loop
description: Turn "make it faster" into a bounded, measured loop. Take a baseline first, try variants that each test one idea, reject any that fail a correctness check, and promote the fastest safe one with commands that reproduce the result. Use when asked to speed something up, cut memory or cost, compare implementations, or try many variants. Skip when there's nothing you can run and measure.
metadata:
  source: "affaan-m/ECC skills/benchmark-optimization-loop"
  license: "MIT, Copyright (c) 2026 Affaan Mustafa. See LICENSE."
---

# Benchmark optimization loop

Turn "make it 20x faster" or "try 50 variants" into a loop that measures each change and stops on a budget.

## Before changing anything

Pin these down, and ask the user for anything you can't find:

- the operation you're speeding up, as one command
- the correctness check that must stay green (tests, or output compared against a saved baseline)
- the metric: wall time, p95 latency, rows per second, memory, cost per run, or error rate
- the input: fixed and representative, the same for every run
- the budget: maximum variants, time, spend, and how much data a run may touch

If the target sounds unrealistic, keep it as the goal but still bound the loop.

## Loop

1. Measure the baseline. Run it several times after a warm-up and note the spread, so you know how much noise there is.
2. Find the bottleneck from evidence (a profiler, timings per stage, query plans), not from intuition.
3. Write variants that each test one idea.
4. Run every variant on the same input, with the same number of repeats.
5. Reject any variant that fails correctness, behaves unsafely, or doesn't reproduce.
6. Promote the fastest variant that passed.
7. Make the winner permanent in a script, config, test, or doc.
8. Rerun the baseline and the winner back to back to confirm the gain.

## Keep a variant table

```text
variant    | idea              | command                         | time | correct | notes
baseline   | current path      | npm run job                     | 120s | yes     | spread ±3s
batch-500  | fewer round trips | npm run job -- --batch 500      | 42s  | yes     | winner
parallel-8 | more workers      | npm run job -- --workers 8      | 31s  | no      | rate limited
```

For long or recursive searches, append every run to a ledger file. Compare each new variant with the best accepted one so far, not only the previous run. Keep a holdout input or a replay check so the winner isn't tuned to a single input.

## When to stop

- the gain is within the noise you measured
- correctness fails and the fix isn't obvious
- you've spent the budget
- variants are changing more things at once than you can attribute

Call the result the "best measured safe variant". Don't call it optimal unless you tried the whole search space.

## Before it becomes the default

- correctness checks pass
- the speedup repeats, or you can explain why it varies
- rolling back is a one-line revert or a config flag
- the change is committed or written into a runbook (ask before committing)
- your summary includes the exact commands and measurements for the baseline and the winner
