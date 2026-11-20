# review_multi and plan_multi: improvements from open-code-review and EGM

Sources, read on 2026-11-17:

- alibaba/open-code-review (OCR), commit `d30f938`, cloned to `/tmp/ocr-eval`.
- google/elephant-goldfish-model (EGM), commit `72d06f5`, cloned to `/tmp/egm-eval`.

Our paths are relative to `extensions/superpowers/`. OCR paths are relative to `internal/`.

## 1. How the tools work today

### review_multi

1. `detectReviewTarget` (`reviewer.ts:191-271`) builds a text target from git. It does not include the diff itself. It gives the changed file list, `--stat` in PR mode, and the line "Use: git diff ..." (`reviewer.ts:234`, `:252`, `:267`).
2. A Sonnet explorer runs with about 12 tool calls, a hard cap of 15, and a 60 s limit (`reviewer.ts:323`; `_shared.ts:685-734`, `:773-823`). Its output is capped at 10 KB (`_shared.ts:819-820`).
3. The task sent to the reviewers combines the target, the explorer findings, the focus text, and the last 2,000 characters of the parent conversation (`reviewer.ts:349-361`; `_shared.ts:835-886`).
4. Four reviewers run in parallel with tools `read,write,grep,find,ls,bash`: A Opus 5.5, B GPT 5.6 Sol, C GLM 5.2, D Opus 5 (`reviewer.ts:153-178`, `:365-419`). Their starts are 1 s apart. The prompts are identical except for the workflow wording. Each reviewer reports merge-blocking issues as `file:line`, why, and how to show it fails, then lists Unconfirmed items and gives a Verdict (`reviewer.ts:80-145`). The "max 5 tool calls" limit is only text: `MEMBER_LIMITS` sets time limits only (`multirun.ts:40-43`).
5. Each subagent is a fresh `pi` process with `--no-extensions --no-skills --no-context-files` (`_shared.ts:316-326`). So the only parent context a reviewer gets is the text we inject in step 3.
6. `buildSynthesisMessage` (`reviewer.ts:517-560`) gives the main agent the four file paths. It asks the main agent to verify each issue, drop the issues it can refute, and sort the rest into consensus, single-reviewer, and unconfirmed issues. All merging and deduping is done by the main agent.
7. `review_followup` (`reviewer.ts:718`) calls `runFollowup` (`multirun.ts:244-317`), which resumes one member's saved session.

### plan_multi

1. References are resolved first. Then a Sonnet explorer runs in plan mode, with a 180 s limit when `web` is on (`planner.ts:257`; prompt at `_shared.ts:637-683`).
2. `composePlannerTask` (`_plan-inputs.ts:91-111`) assembles the task in this order: conversation, provided research, Phase 0 findings, task.
3. Four planners use the same model set (`planner.ts:165-195`) and share one `PLAN_FORMAT` (`planner.ts:82-118`). The format requires per-task fields: Files owned, Depends on, Mode, and verification.
4. `buildReviewMessage` (`planner.ts:694-725`) puts all four plans into one message and leaves the comparison to the main agent. No step checks the plans against the code or the task.

Tests exist for argument parsing, prompt composition, limits, and background runs (`test/plan-inputs.test.ts`, `test/run-limits.test.ts`, `test/async.test.ts`, `test/background.test.ts`). No test covers the review or plan output. The tests use `node:test` with `test/_resolve-ts.ts`.

## 2. Ranked proposals

The proposals are ranked by value per unit of effort. P1–P4 add no model calls.

### P1. Deterministic diff pre-pass for review_multi

- **Idea and source.** OCR does not let the model fetch the diff. It parses the diff and filters it before any model call (`agent/agent.go:278-444`). It removes binary files, secret paths, files with disallowed extensions, and generated or default paths (`agent/selection.go:70-103`). It marks deletions as context only, and a token-size gate removes oversized files (`selection.go:43-62`). It puts the diffs into the prompt as `<file path>` blocks (`agent/agent.go:1659-1672`, `config/template/prompts/main_task_user.md:1-8`). Other changed files appear as one-line `STATUS path (+N/-M)` entries (`agent.go:1674-1688`).
- **Change.**
  - Add a new pure module `_diff-map.ts` with three functions:
    - `parseUnifiedDiff(text)` returns `{path, status, added, deleted, newRanges:[start,end][]}[]` from `@@ -a,b +c,d @@` hunk headers.
    - `filterReviewable(files)` drops lockfiles, binaries, `dist/`, `*.min.*`, and `.env*` and records the reason for each.
    - `renderDiffContext(files, diffText, budgetChars)` renders the file table and the changed-line ranges. It inlines the diff only while the diff fits in `budgetChars` (default 24 KB).
  - In `detectReviewTarget`, run `git diff -U0 --no-color` for the same range (base...branch, or working tree plus `--staged`). Add the rendered block under `## Changed lines (authoritative)`.
  - Feed the same block to the explorer through `preContext` so that it stops spending a tool call on `git diff --stat`.
- **Cost.** No model calls. Each reviewer gets up to about 6k more input tokens, or about 24k across the four reviewers. Most of this replaces `git diff` output that each reviewer would otherwise fetch. Each reviewer and the explorer saves one or two tool calls.
- **Test.** Add `test/diff-map.test.ts` with these assertions:
  - `@@ -10,0 +11,3 @@` maps to `[[11,13]]`.
  - A hunk that only deletes lines produces no new range.
  - A rename keeps its new path.
  - `package-lock.json` is excluded with reason `lockfile`.
  - Above the budget, the output contains the ranges but no `+` lines.
- **Risks.** Line numbers in a working-tree diff change as the user keeps editing. Mitigation: record the time of the snapshot in the block. Very large diffs fall back to ranges only, which is what reviewers effectively get today.

### P2. Verify line anchors from quoted code, and tag findings against the changed-line map

- **Idea and source.** OCR does not trust the line numbers a model reports. Its `code_comment` tool requires `existing_code`, which must be added lines copied verbatim (`config/toolsconfig/tools.json:29`, `:43-46`). `ResolveLineNumbers` finds the real lines by matching that quote against the diff. It tries the new side, then the new side without blank lines, then the old side (`diff/resolver.go:16-57`, `:155-197`, `:230-248`). If those fail, it scans the whole new file (`:251+`). If the quote belongs to another file, the comment is re-filed only when there is exactly one match (`resolver.go:101-150`). A comment that cannot be placed is still kept (`reviewtask/tools.go:117-163`).
- **Change.**
  - In both `REVIEWER_PROMPT_A` and `REVIEWER_PROMPT_B` (`reviewer.ts:80-145`), require each blocking issue to follow its `file:line` with a fenced block that quotes one to five lines verbatim.
  - Add `anchorFindings(reviewText, changedMap, readFile)` to `_diff-map.ts`. It parses the `file:line` and quote pairs, finds the quote in the current file, and returns one of the tags `exact`, `moved→N`, or `quote not found`. It also tags each issue `changed line`, `changed file, unchanged line`, or `outside diff`.
  - After `settleOutput` (`reviewer.ts:402`), write the tags to `review-<k>.anchors.md` and list them in `buildSynthesisMessage`.
  - Never drop a finding automatically. A regression in an unchanged caller is a valid blocker.
- **Cost.** No model calls. Reviewer output grows by about 5–10%.
- **Test.** In `test/diff-map.test.ts`, use a fixture file and a fixture review. Assertions:
  - A quote at line 40 cited as `:38` returns `moved→40`.
  - An invented quote returns `quote not found`.
  - A finding on a caller outside the diff is tagged `outside diff` and is still in the output.
  - Quotes match when the only differences are whitespace or blank lines.
- **Risks.** Some reviewers will skip the quote. Those findings are tagged `no quote`, which costs nothing. The regex parser can miss unusual formatting, so a parse miss must keep the finding untagged and never remove it.

### P3. Asymmetric-error rules in the synthesis message

- **Idea and source.** OCR's filter treats its two possible errors differently. Removing a correct comment "silently destroys a real finding", while keeping a wrong one costs a few seconds (`config/template/prompts/review_filter_task_system.md:7-12`). The filter may remove a comment only on two grounds: the target code is absent from the diff, or one diff line literally contradicts the comment (`review_filter_task_user.md:9-29`). A comment that cannot be verified is not wrong (`:43-50`). Some subjects are vetoed from removal: concurrency, memory safety, behavior or compatibility changes, and unused parameters (`:31-41`). The tool schema asks for `analysis` before `comment_ids`, so the model reasons before it commits (`agent/agent.go:1604-1656`).
- **Change.** In `buildSynthesisMessage` (`reviewer.ts:541-543`), replace "Drop issues you can refute" with three rules:
  - Drop an issue only when you can cite the file:line that refutes it. Put that citation in a "Dropped" list.
  - "Could not reproduce" moves the issue to Unconfirmed. It does not drop it.
  - Never drop an issue about concurrency, data loss, auth, or a behavior or compatibility change. Mark it unconfirmed instead.
- **Cost.** No model calls. The synthesis prompt grows by about 100 tokens.
- **Test.** Export `buildSynthesisMessage`, or move it to a pure `_review-message.ts`. Add `test/review-message.test.ts` and assert that the message contains "Dropped" and the never-drop list.
- **Risks.** The main agent's answers get somewhat longer. The rule is only text, so check that it works with the measurement in P5.

### P4. Overlap pre-grouping and "not run" accounting

- **Idea and sources.**
  - OCR's dedup step requires every id to appear in exactly one group. It rejects unknown or duplicate ids (`scan/agent.go:1073-1130`). It merges only comments that make the same claim, never comments that only touch the same area (`config/template/scan_template.json:29`, `DEDUP_TASK` rules).
  - EGM says a reviewer that failed or returned nothing "did not review". Retry it once, record it as **not run**, and never count it as a reviewer with zero findings (`skills/egm-review-loop/SKILL.md:140-144`; `agents/synthesizer.md:41`).
- **Change.**
  - Using the parsed anchors from P2, group findings across A–D by path and new-line range within ±3 lines. Emit a "Candidate overlaps" table with columns `path:range | reviewers | first sentence of each`. The table proposes groups. It does not merge them. The main agent decides whether two findings make the same claim.
  - In `buildSynthesisMessage`, state "N of 4 reviewers completed". Define consensus as "reported by two or more completed reviewers" and label failed members `not run`.
  - Retrying a failed member once is optional. It is worth doing only after `settleOutput` reports an idle kill (`multirun.ts:59-88`).
- **Cost.** No model calls without the retry. A retry costs at most one reviewer call, and only for failed members.
- **Test.** Add a test in `test/diff-map.test.ts`: two fixture reviews cite `a.ts:10` and `a.ts:12`, and the function returns one group with keys `[A,C]`. In `test/review-message.test.ts`, give one result with `status:"error"` and assert that the message contains `not run` and `3 of 4`.
- **Risks.** Line proximity is not the same as the same claim. That is why the table only proposes groups and does not merge them.

### P5. Goldfish critic for plan_multi (opt-in `critic: true`, default off until measured)

- **Idea and source.** EGM reviewers start in a fresh context with no conversation history. They get only the task, the target, the persona and standard paths, and the context files supplied explicitly. EGM tells the caller not to copy the parent's deliberation (`docs/claude.md:129-166`; `skills/egm-review-loop/SKILL.md:24-27`, `:36-44`). The reviewers have read-only tools (`docs/claude.md:136-141`). The checks to borrow:
  - The Zero-Decision Rule: a plan fails if the implementer must make a design choice (`resources/document_standards/implementation-readiness-standard.md:5-18`).
  - Phases that each leave the code buildable (`:20-23`).
  - The `Codebase Details` vectors "Contradicts the Code" and "Non-Existent References", where files the plan says it will create are not findings (`agents/codebase_details.md:47-50`).
  - The comprehension paraphrase: write "What this proposes" first, and treat a wrong paraphrase as a finding (`agents/comprehension.md:37`, `:57`).
- **Change.**
  - In `planner.ts`, after the planners settle (`:343-364`), run one more `runAgent` with tools `read,grep,find,ls,write`. Its task contains only the raw task text, the four plan file paths, and the instruction to write a report file.
  - It must not get the explorer findings, the conversation, or the provided research. Do not pass these through `composePlannerTask`.
  - The new `CRITIC_PROMPT` asks for these sections:
    - A two-sentence paraphrase of each plan.
    - Per-plan findings: Blocker, Major, or Nit; then `Plan X / Task N`; then the cited source `file:line`.
    - The finding categories: decisions left to the implementer, references that do not exist, claims that contradict the code, tasks that leave the build broken, and parallel tasks that own the same file.
  - `buildReviewMessage` (`planner.ts:694-725`) appends the critic report path and the line "verify each critic claim before using it".
  - Use a provider that is not the same model as its planner, for example `MODELS.check` (Sonnet). The critic's model must not be the same as any planner's.
- **Cost.** One more model call. Input is the four plans (about 15–40 KB) plus 5–15 file reads. With Sonnet, that is roughly 20–40% of one planner's cost and adds 1–3 minutes of wall time. The critic runs after the planners, so its time adds to the run.
- **Test.** Move the critic task builder into `_plan-inputs.ts` as `composeCriticTask({task, planFiles})`. In `test/plan-inputs.test.ts`, assert:
  - The output contains each plan path and the task.
  - It does not contain `Codebase Exploration Findings`, `Conversation Context`, or `Provided Research`, even when the caller passes those values.

  The isolation is a type and test contract, so a later edit cannot leak context silently. Measure value with the `agent-evaluation` skill: about 5 frozen tasks, compared with and without the critic, counting critic Blockers that the main agent confirmed.
- **Risks.**
  - The task text can still carry the user's framing. EGM also passes the target document.
  - Fresh reviewers "sample differently each round" (`egm-review-loop/SKILL.md:159-160`), so expect some new Nits on every run. Report Blocker and Major findings only.
  - The critic does not know the user's intent, which it learns only from the conversation. That is intended, but some findings will say "unclear" about things the user already settled.

### P6. Goldfish variant for two of the four reviewers (experiment, not a default)

- **Idea and source.** EGM: "do not copy parent deliberation" (`docs/claude.md:133-134`). Our reviewers already run with `--no-context-files` (`_shared.ts:324`). The only parent bias they get is the injected `## Conversation Context` (`reviewer.ts:356-360`), which tells them to "inform your review" with the author's framing.
- **Change.** Add `isolated?: boolean` to `Reviewer` (`reviewer.ts:144-150`). Set it on C and D, and skip the conversation block for those two. Keep the explorer facts and `focus`.
- **Cost.** C and D each read about 500 fewer input tokens.
- **Test.** Factor the task assembly into `composeReviewerTask({target, findings, focus, conversation, isolated})`. Add `test/review-message.test.ts`, which asserts that `isolated:true` output contains no `Conversation Context`.
- **Risks.** Isolated reviewers may flag behavior that the user asked for on purpose. Adopt this only if an A/B run on frozen diffs shows that C and D find real issues that A and B miss.

### Rejected

- **Separate LLM fact-check filter after the reviewers** (OCR `executeGroupReviewFilter`, `agent/agent.go:1555`, `:1841`). It adds four or more calls, and the main agent already verifies findings with the code open. P3 brings over OCR's rules without the call.
- **LLM dedup step** (OCR `DEDUP_TASK`). It is one more call, and the main agent must still read the four source reviews to verify them. P4's deterministic table covers the cheap part.
- **Splitting large diffs across reviewers** (OCR `agent/grouping.go:68-113`, `:323-368`). OCR does this to fit one model's prompt. Our reviewers read files with tools and must see changes that span files. Partitioning would hide breaks between files. P1's budget fallback to ranges only is enough.
- **Multi-round review with confirmed-findings carryover** (OCR `agent/agent.go:1480-1596`; round 2 drops the plan at `:1511-1513`; stops early at `:1587-1595`; cap `confirmedCap = 30`, `agent/util.go:49`). It doubles the cost of all four models. `review_followup` already re-checks on demand.
- **Lint and typecheck inside the pre-pass.** OCR has no deterministic linter. Its "rules" are per-language checklists given to the model (`config/rules/system_rules.json`, `agent/agent.go:1729-1784`). Commands for our repositories differ, slow ones would block the start of the run, and pi-lens already reports diagnostics to the main agent. If wanted later, add an opt-in `checks: string[]` parameter and pass its output as data. It must never gate the run.
- **EGM review loop with convergence** (two clean rounds, a cap of 5, settled findings; `egm-review-loop/SKILL.md:157-181`). It needs a human between rounds and two to five times the critic's cost. Revisit after P5 shows value. If adopted, keep its "settled" list so that contested findings do not reopen.
- **EGM drift report** (`skills/egm-drift-report/SKILL.md:24-45`). The local `validate-plan` skill already checks code against a plan. The only part worth adopting is the category "describes current behavior the code lacks", which P5's critic already includes.

## 3. What not to copy

- OCR's custom tool-call schema (`code_comment`, `task_done`) and its async worker pool. Pi subagents write Markdown files, and P2 gets the anchoring benefit by parsing that Markdown.
- OCR's LLM re-location call (`diff/relocation.go:44-96`, `re_location_task_system.md:1`). It is a model call to fix a line number. We report `quote not found` instead.
- OCR's run manifest, telemetry spans, resume lineage, and per-group token budgets (`agent/agent.go:953-1345`). Our `multirun.ts` run state is enough.
- EGM's interactive gates (one question per turn, option payloads), its artifact-first rules, and its banned-word lists (`skills/egm-review/SKILL.md`, Execution Constraints 1-11). These are for a human-driven document workflow, not for background tools.
- EGM's seven-persona swarm and its synthesizer subagent. A second aggregation layer duplicates our main agent and adds a call.
- Severity enums for review findings. Our reviewers report blockers only by design. Adding Major and Nit levels would bring back the noise the prompt removes. Severity labels fit only the plan critic (P5).

## 4. Unconfirmed items and where I looked

- **How much the inlined diff reduces reviewer tool calls (P1).** Not measured. Reviewers' tool use is in `<run>/*.session.jsonl`, written by `addMember` (`multirun.ts:140-170`). I did not inspect real runs.
- **How often reviewers cite a wrong line today (P2).** Not measured. To check, run `anchorFindings` over saved `review-*.md` files in `runsRoot()` (`multirun.ts:102`).
- **OCR's effect on false positives.** Its README and code describe the design but give no precision numbers that I could check. I searched `README.md` and `docs/`.
- **Whether EGM's isolation improves results.** EGM records only the isolation mechanism and harness test status (`docs/harnesses.md:148-157`, `docs/codex.md:66-78`). I found no quality evaluation.
- **Separate issue in `detectReviewTarget`.** On a feature branch with commits, the function returns at `reviewer.ts:239-255` before it checks `git status` at `:258`. Uncommitted changes are then never reviewed. I traced this in the code but did not reproduce it. P1 should cover both diffs, or say which one it reviewed.
- **Write paths.** Pi's `--tools` names the tools but cannot limit `write` to the output file. The same is true of EGM in Claude (`docs/claude.md:143-147`). The read-only promise for the P5 critic depends on its prompt.
