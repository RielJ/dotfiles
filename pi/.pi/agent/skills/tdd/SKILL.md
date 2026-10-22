---
name: tdd
description: Fix a bug test-first. Write a focused regression test, watch it fail for the right reason, make the smallest fix, and watch it pass. Use when the user asks for TDD, a failing test, or a regression test, or when the bug has an obvious, cheap local test target. Skip when the test path is unclear, expensive, integration-heavy, or not requested.
metadata:
  source: "cursor_plugins/pstack/skills/tdd (Lauren Tan, pstack)"
  license: "MIT, Copyright (c) 2026 Lauren Tan. See LICENSE."
---

# TDD bug fix

When a bug has a clear, cheap test path, make the broken behavior executable before you change production code. The goal is a focused regression test that fails before the fix and passes after it.

Don't force a test when it would be impractical. If the test would need broad harness setup, brittle mocks, slow end-to-end infrastructure, production-only state, vague reproduction steps, or large unrelated fixture churn, skip the new test and use the closest useful check instead.

## Workflow

1. **Understand the bug.** Identify the intended behavior, the current behavior, the affected path, and the smallest observable reproduction. If you can't yet say what causes it, use `systematic-debugging` to find the cause, then come back.
2. **Choose the narrowest executable check.** Prefer the closest unit, component, integration, or regression test already used for that code path. Find it with `fffind` and `ffgrep`. If no practical test path is obvious, don't build one from scratch just to satisfy the workflow.
3. **Write the failing test first.** Add the smallest focused test that would have caught the bug. The test encodes intended behavior, not the current implementation.
4. **Run the new test before fixing.** Confirm it fails for the intended reason. If it passes, or fails for an unrelated reason, correct the test or the reproduction before you edit the implementation.
5. **Fix the bug.** Make the smallest production change that gives the intended behavior and keeps nearby contracts.
6. **Rerun the regression test.** Confirm it passes, then run the nearby suite.

## If a failing test is impractical

Use the closest executable regression check instead: a targeted script, a manual reproduction command, browser automation, a snapshot comparison, a log assertion, or a focused integration check.

Prefer no new test over a bad test. A bad test mostly tests mocks, encodes implementation details, depends on timing or unrelated global state, needs expensive infrastructure for a small fix, or would be deleted right after it proves the fix. `principles` (`references/test-behavior-not-implementation.md`) lists the shapes that can't fail for a defect.

## Guardrails

- Don't change tests just to match a wrong implementation.
- Don't weaken existing assertions unless the expected behavior has really changed and the reason is clear.
- Keep the regression test focused on the bug. Avoid broad fixture churn or unrelated coverage.
- If the bug is flaky, make the test deterministic where you can and write down which signal it locks down.
- If the bug exposes a broader class of failures, land the focused regression test first, then consider sibling coverage.

**Reply:** the evidence, not just the outcome.

- Name the failing-before test or executable check and the failure it produced.
- Name the passing-after run and any nearby checks you ran.
- If you couldn't show a failing-before result, say why and describe the closest regression check you used instead.
