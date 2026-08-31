# Plan: Executor UX Upgrade (in-house, not pi-subagents)

## Decision

Keep the in-house executor. Do NOT adopt `@tintinweb/pi-subagents`.

Rationale (consensus of 3 planning models):

- pi-subagents loads 3 tool schemas (`Agent`, `get_subagent_result`, `steer_subagent`)
  plus a system-prompt block into the **main Opus 4.8 session on every turn** — the exact
  recurring context cost the user uninstalled it for, plus a behavioral cost (the model
  proactively spawns agents when the tool is visible).
- The executor registers ONE on-demand tool (`execute_plan`); its builders are isolated
  `pi` subprocesses that never touch the main context window.
- The desired UX (live activity, drill-down viewer, token counts) is render-layer work that
  costs zero model tokens. Tee builder NDJSON streams to log files and view them in a modal —
  logs are files, not messages, so the "conversation viewer" equivalent re-enters no context.
- Hybrid via `subagents:rpc:spawn` rejected: the RPC and tool schemas are wired together in
  pi-subagents' index.ts; you cannot load the UI without the always-on tools. Extensions load
  at session start, so no real lazy-load. Vendor fork risk: pi-subagents imports
  `@mariozechner/...` while this repo uses `@earendil-works/...`.

Net: ~85% of pi-subagents' UX at ~0% of its always-on token cost.

## Scope

Files: `extensions/superpowers/executor.ts`, `extensions/superpowers/_shared.ts`.
No new always-on tools. `systemPromptWhenEnabled` stays short.

## P0 — Correctness (ship first)

### Task 1 — Structured verdict
- Append to `CHECKER_PROMPT`: require a final line `VERDICT: PASS` or `VERDICT: FAIL`.
- Add `parseVerdict(output): boolean` — match `/VERDICT:\s*(PASS|FAIL)/i` (last match wins).
  Fallback when no verdict line: conservative heuristic (treat checker process exit != 0 as
  FAIL; count `failed`/`error` vs `passed`; default PASS only when not clearly failing).
- Replace `passed = !checkerOutput.toLowerCase().includes("fail")`.
- Treat `check.exitCode !== 0` as FAIL regardless of text.

### Task 2 — Fix resume monolithic-retry bug
- Remove the `if (attempt === startAttempt && completedIndices.size === 0) { waves } else { monolithic }`
  split. The wave loop becomes the only build path; it already filters
  `pending = wave.filter(s => !completedIndices.has(s.index))`, so resume continues mid-DAG.
- On a checker FAIL retry (`attempt > startAttempt`), inject `checkerOutput` as failure context
  into each pending section's task, and reset `completedIndices` so sections re-run with feedback.
- Validate `completedIndices` against `sections.length` on resume (filter out-of-range).

### Task 3 — Concurrency control + allSettled
- Replace `setTimeout(500)` stagger with a `runWithConcurrency(items, limit, fn)` helper
  (limit `MAX_PARALLEL_BUILDERS = 3`).
- Use `Promise.allSettled` per wave so one failed builder doesn't crash the wave; only add
  sections that actually finished (`exitCode === 0`) to `completedIndices`.

## P1 — UX payoff

### Task 4 — Tee builder NDJSON to log files
- Add `logPath?: string` to `RunAgentOptions`. In the stdout handler, append each raw line to
  `logPath`. Executor writes one log per builder at `.pi/execute-logs/<plan>-s<index>.ndjson`
  and one for the checker. Ring-buffer / size cap; clean logs older than N days on `/execute`.

### Task 5 — Token accounting
- In `_shared.ts processLine`, capture usage from the stream (verify field name by probing
  `pi --mode json -p "hi"` once). Accumulate input/output; expose `AgentResult.usage`.
- Store per-agent usage in executor widget state; render `· 12.4k→1.1k` per row + wave total.
- If usage events absent: degrade to tool-count + output-char proxy, document it, never throw.

### Task 6 — Per-builder stop + drill-down viewer
- Thread a real `AbortController` per builder (the `/execute` command currently passes
  `signal: undefined`). Register `/execute-stop [section|all]` → `.abort()` (runAgent already
  SIGTERMs). Surface section list in widget footer.
- Register `/execute-log [section]` → `ctx.ui.custom(...)` modal rendering the builder's NDJSON
  log as a readable transcript (turns, tool calls, results). j/k scroll, q/esc close.

### Task 7 — Git manifest in final result
- Replace truncated `builderOutput.slice(0,5000)` blob with structured summary: per-section
  short narrative + `git diff --stat` + changed-file list (`git status --porcelain`).

## P2 — Polish

### Task 8 — HITL checkpoint after DAG
- After `buildWaves`, before executing, show waves via `ctx.ui.custom` approval modal
  (approve / abort). Add `auto?: boolean` to `execute_plan` params — default true for the tool
  (non-blocking automated flow), interactive default for the `/execute` command.

### Task 9 — Widget polish + decision doc
- Spinner on running agents, `wave 2/4` progress, long-title truncation.
- Top-of-file comment in `executor.ts` recording the pi-subagents decision.
- Concurrent-`/execute` guard (refuse / notify if one is in flight).

## Acceptance

- No new always-on tool schemas (still one `execute_plan`).
- `parseVerdict("don't fail silently")` ≠ failure; `VERDICT: FAIL` = failure.
- Resume continues remaining waves (not monolithic retry).
- Bounded concurrency; `allSettled` per wave; no orphan `pi` processes after `/execute-stop`.
- Widget shows token usage (or documented proxy); `/execute-log` opens a transcript modal.
- Final result includes `git diff --stat` manifest.
- Typecheck/lint clean on both files.
