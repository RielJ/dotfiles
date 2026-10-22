---
name: principles
description: Apply a named engineering principle to a design decision, refactor, debugging dead end, performance claim, or test. Indexes 24 principles (root causes, boundaries, type discipline, subtraction, idempotency, explain the number, and more) plus a benchmark checklist, each in references/. Use when choosing types or data structures, planning a refactor or migration, stuck after two failed fixes, reporting a speedup or regression, writing or keeping a test, or asked "which principle applies" or "why this design". Skip for trivial edits with one obvious answer.
metadata:
  source: "cursor_plugins/pstack/skills/principle-* and benchmark-checklist (Lauren Tan, pstack)"
  license: "MIT, Copyright (c) 2026 Lauren Tan. See LICENSE."
---

# Principles

Twenty-four engineering principles and one checklist, each in its own file under `references/`. This file is the index. Pick the rows whose trigger matches the work, then read the reference.

## How to use

1. Find the rows whose trigger matches what you are doing. Usually one or two apply. Never cite more than you read.
2. Read `references/<name>.md` before you apply or cite a principle. The one-line rule below is a pointer, not the principle.
3. When you apply one, name it and the choice it changed: "Per subtract-before-you-add, I deleted the old parser before adding the new one." A citation that changed nothing is decoration. Cut it.
4. When two principles pull in opposite directions, say which one won and why.

## Index

### Design and structure

| Name | Rule | Trigger |
|------|------|---------|
| `foundational-thinking` | Get the data structures right first so the code after them is obvious. | Choosing core types, sequencing scaffold against features. |
| `model-the-domain` | Encode the domain in a structure (state machine, union, registry) instead of scattered conditionals. | Stateful logic, a growing if/else chain, a second boolean that must stay in sync. |
| `type-system-discipline` | Make illegal states unrepresentable, brand primitives, parse at boundaries, exhaust variants. | Designing types or reviewing a signature in a typed language. |
| `boundary-discipline` | Validate at system boundaries, trust internal types, keep logic in pure functions. | Wiring validation, error handling, or framework adapters. |
| `minimize-reader-load` | Count layers to trace and state to hold. Collapse one-caller wrappers. | Code that is hard to follow, review of new layers. |
| `exhaust-the-design-space` | Build 2-3 competing sketches before you commit to a novel design. | A UI interaction or architecture choice with no precedent in the repo. |
| `experience-first` | Pick user delight over implementation convenience. Ship fewer, better features. | Product, UX, or API-ergonomics tradeoffs. |
| `redesign-from-first-principles` | Redesign as if the new requirement had been there from day one. | Integrating a new requirement into an existing design. |

### Change and refactoring

| Name | Rule | Trigger |
|------|------|---------|
| `subtract-before-you-add` | Remove dead code and redundant guards first, then build on the simpler base. | Sequencing an addition, refactor, or rewrite. |
| `laziness-protocol` | Prefer deletion and the smallest diff. Question signal threading. | Refactoring, judging diff size, tempted to add a layer. |
| `migrate-callers-then-delete-legacy-apis` | Migrate every caller and delete the old API in the same wave. | A new internal API while old callers remain. |
| `outcome-oriented-execution` | Converge on the target. Don't keep throwaway compatibility code for smooth middle states. | Planned rewrites and migrations with phase boundaries. |
| `sequence-verifiable-units` | Break work into small units that each end green, and check each before the next. | Sweeps, migrations, runs of similar edits, ordering commits when asked to commit. |
| `build-the-lever` | Build the codemod, script, or check instead of doing non-trivial work by hand. | Any non-trivial edit, migration, analysis, or verification. |
| `encode-lessons-in-structure` | Turn a repeated instruction into a lint, type, check, or script. | Writing the same instruction twice, a recurring correction. |

### Debugging and verification

| Name | Rule | Trigger |
|------|------|---------|
| `fix-root-causes` | Reproduce, ask why until the root, fix it there. No guards that silence symptoms. | Debugging any failure. |
| `attack-the-premise` | After two fixes on one premise fail, write the premise down and take a census. | Debugging dead end, repeated failed fixes. |
| `prove-it-works` | Check the real artifact, not a proxy or a self-report. Script the check. | Before declaring any task done. |
| `test-behavior-not-implementation` | Assert observed results against literal values. Delete tests that pass when everything returns `undefined`. | Writing, changing, or keeping a test. |
| `explain-the-number` | Before you trust a number, name its limiter and rule out that it measured something else. Ask "why not double?" | Reporting a speedup, regression, latency, throughput, or eval result. |
| `benchmark-checklist` | Seven questions (limiter, tuning, limits, errors, repeatability, relevance, did it happen) for a perf number. | Running a benchmark. Use with `explain-the-number`. |

### Concurrency and state

| Name | Rule | Trigger |
|------|------|---------|
| `make-operations-idempotent` | Converge to the same end state after any number of runs or partial crashes. | Commands, lifecycle steps, retry loops. |
| `separate-before-serializing-shared-state` | Remove the shared write target first. Lock only when one writer is a real invariant. | Concurrent actors writing one file, branch, key, or object. |

### Working as an agent

| Name | Rule | Trigger |
|------|------|---------|
| `guard-the-context-window` | Send bulk output to a `subagent` and keep summaries in the main thread. | Large outputs, long files, repeated reads, fan-out planning. |
| `never-block-on-the-human` | On reversible work, proceed and present. Confirm only irreversible actions. | Tempted to ask "should I do X?" about a reversible change. |

## Related skills

- `typescript-best-practices` applies `type-system-discipline` and `boundary-discipline` to TypeScript.
- `tdd` and `correct` lean on `test-behavior-not-implementation` and `encode-lessons-in-structure`.
- `show-me-your-work` is the decision log for `prove-it-works` on long runs.

Source: adapted from Lauren Tan's pstack skills (MIT, Copyright (c) 2026 Lauren Tan). See `LICENSE`.
