# Memory extension v0: spec and plan

Background: [memory-extension.md](../research/memory-extension.md) and [second-brain-landscape.md](../research/second-brain-landscape.md). Decisions below were made with the user on 2026-10-15.

## Summary

Long-term memory for Pi, stored as plain Markdown in `~/.pi/memory/` (local only, never pushed, nothing written into code repos). At session start the extension injects two small files: global `core.md` and the current repo's `core.md`. Everything else (`index.md`, notes) is read on demand through the extension's tools. Tool metadata carries model-facing guidance; storage details stay in the implementation and README. The extension also handles saving, search, review and lint. You approve anything the agent didn't save on its own initiative from a clean session; a weekly lint flags weak memories.

## Decisions

| Topic | Decision |
|---|---|
| Approach | Own extension. Injects global and repo `core.md` once per session; `index.md` and notes are read on demand through tool metadata rather than global prompt instructions. In-process SQLite FTS5 backs `memory_search`; qmd stays for manual deep search |
| Location | Everything under `~/.pi/memory/` on this machine, including each repo's setup (`repos/<key>/core.md`). No memory files inside any repo |
| New repo | First session in a repo with no `core.md` creates an empty stub and says so |
| Scope | `global/` plus `repos/<owner>-<repo>/`, keyed by git remote so all worktrees share one memory |
| Storage | `~/.pi/memory/`, ignored by the dotfiles repo; its own local git repo with no remote |
| `.pi` in repos | Ignored everywhere through `~/.config/git/ignore` (done) |
| Saves you request | Saved directly (`/memory save`, or "remember this") |
| Saves the agent decides on | Saved directly with `source: agent`, unless the session read outside content (web, browser, fetched URLs, `curl`/`wget`), then they go to `inbox/` |
| Compaction | Candidates extracted by `anthropic/claude-haiku-5-5` always go to `inbox/` |
| Review | Only when you run `/memory review` |
| History | Extension auto-commits each change to `~/.pi/memory` (local repo, no remote) |
| Quality | `confidence` field plus a weekly `/memory lint` that reports weak memories |

## Store layout

```text
~/.pi/memory/
  .git/                     local only, no remote
  .gitignore                .index.sqlite, .stats.json
  index.md                  generated: one line per note
  log.md                    append-only: ## [YYYY-MM-DD] save|approve|reject|lint | id
  global/core.md            ≤ 300 tokens, loaded every session
  global/notes/<id>.md
  repos/<owner>-<repo>/core.md
  repos/<owner>-<repo>/notes/<id>.md
  inbox/<YYYYMMDD-HHMM>-<id>.md
  .index.sqlite             FTS5 index, rebuilt from files (never the source of truth)
  .stats.json               search and read counts per note
```

Repo key: `origin` remote → `owner-repo` (lowercase). No remote: the name of the main worktree directory (from `git rev-parse --git-common-dir`). Outside git: global only.

## Note format

```markdown
---
id: pnpm-only
type: preference            # preference | decision | fact | gotcha | procedure
scope: repo:rielj-web-portfollio   # or global
summary: Use pnpm, never npm.
why: npm created a second lockfile and broke CI (2026-09-12).
confidence: high            # high | medium | low
source: user                # user | agent | compaction
created: 2026-10-15
confirmed: 2026-10-15       # last time you confirmed it
review_after: 2027-04-15
supersedes: [[npm-ok]]
relates: []
---
Optional body, at most ~120 words.
```

Rules: `summary` and `why` are required. Superseded notes are never returned by `memory_search`.

## Confidence

| Event | Confidence |
|---|---|
| You save or approve it | high |
| Agent saves it in a clean session | medium |
| Approved from inbox without edits | medium; high if you mark it confirmed |
| You confirm it in `/memory lint` | high; `confirmed` and `review_after` reset |
| `review_after` passes without confirmation | drops one level |
| Low | excluded from `memory_search` by default; reachable with `include_low: true` or a direct `id` read |

## Read path

- **Session start:** the extension resolves the repo key; if `repos/<key>/core.md` doesn't exist it creates an empty stub (frontmatter only) and shows a one-line notice. It then injects one memory block with global `core.md` and the repo's `core.md` (each capped at 300 tokens) through the `context` event before the first message. The block is identical for the whole session, so the prompt cache stays valid, and it's never written to the session file.
- **Pointers:** tool descriptions and `promptGuidelines` say when to search, read and write memory. `SYSTEM.md` contains no memory implementation details.
- **On demand:** `memory_search({ query, scope? })` returns `[[id]] summary` lines within a 600-token budget (high and medium confidence only); `memory_search({ id })` returns one full note.
- **Logging:** each search or full-note read records the ids used in `.stats.json`, which lint uses to find notes nobody uses.
- **Per-run search injection is deferred.** Only the two `core.md` files are injected. Revisit after a week of `/memory status` numbers.

## Write path

- `memory_write({ summary, why, type, scope, body?, requested_by: "user" | "agent" })`:
  - **Secret scan:** refuse API keys, tokens and private keys.
  - **Duplicate check:** an FTS match on `summary` in the same scope means merge or link instead of a new note.
  - **Where it goes:** `requested_by: user` saves directly, but in a tainted session only if your latest message asks to remember or save. `requested_by: agent` saves directly in a clean session and goes to `inbox/` in a tainted one.
  - **Cap:** a write that would push `core.md` past 300 tokens fails and asks for a merge or a removal.
  - Every change appends to `log.md`, rebuilds `index.md` and auto-commits.
- **Taint:** set when the session uses `web_search`, `web_read`, `browser_*`, `agent_browser*` or MCP fetch tools, or `bash` with `curl`/`wget`/`gh api`. It lasts until the session ends.
- **Compaction:** in `session_before_compact`, fire and forget, never blocking compaction. Serialize `messagesToSummarize`, capped at 60k characters, and send it to Haiku 5.5 with a fixed JSON schema. Write the candidates to `inbox/` and return nothing, so pi-vcc's summary still applies.

## Commands

- `/memory save <text>` saves directly with `source: user` and `confidence: high`. It asks for `why` if it's missing.
- `/memory review` goes through each inbox candidate: approve, edit, reject or merge.
- `/memory lint` is the weekly report. It flags:
  - notes missing `why`;
  - low-confidence notes;
  - medium notes never searched or read in 60 days;
  - notes past `review_after`;
  - likely contradictions (same scope, similar summary, no `supersedes` link);
  - orphans and broken links;
  - `core.md` over its cap.

  For each flagged note you choose confirm, demote, delete or keep. The only automatic change is the decay from the confidence table (an overdue note drops one level and gets a new `review_after`); every other edit needs your choice.
- `/memory status` shows counts by scope and confidence, inbox size, and token totals for the last 7 days.

## Tasks

## Task 1: Store, note format and repo key
- **Files owned:** `extensions/memory/store.ts`, `extensions/memory/test/store.test.ts`, `extensions/memory/package.json`
- **Depends on:** none
- **Mode:** contract-first
- **Steps:** parse and serialize notes (YAML frontmatter), resolve the repo key, create the layout, rebuild `index.md`, append to `log.md`, auto-commit through `git -C ~/.pi/memory`. The store path is configurable (env `PI_MEMORY_DIR`) for tests.
- **Automated verification:** `bun test extensions/memory/test/store.test.ts` covers note round-trips, repo keys for a remote, a worktree, no remote and no git, and that `index.md` is regenerated
- **Manual verification:** none

## Task 2: FTS index and budgeted recall
- **Files owned:** `extensions/memory/search.ts`, `extensions/memory/test/search.test.ts`
- **Depends on:** Task 1
- **Mode:** sequential
- **Steps:** `node:sqlite` FTS5 over summary, why, body and type; incremental rebuild by file modification time; filter by scope and confidence; one-hop expansion; format results within a token budget (characters / 4).
- **Automated verification:** tests for ranking, scope filtering, the ban on superseded notes and the budget cutoff; runs on Node 22 and 24
- **Manual verification:** none

## Task 3: Tools and taint routing
- **Files owned:** `extensions/memory/tools.ts`, `extensions/memory/taint.ts`, `extensions/memory/secrets.ts`, `extensions/memory/test/tools.test.ts`
- **Depends on:** Task 1, Task 2
- **Mode:** sequential
- **Steps:** `memory_search` handles query search and full-note reads by id; `memory_write` handles durable writes; detect taint from tool calls; secret scan; duplicate check; cap on `core.md`.
- **Automated verification:** tests for routing to direct vs. inbox, secret refusal, duplicate merge and cap errors
- **Manual verification:** none

## Task 4: Entry point, core injection, repo stub and stats
- **Files owned:** `extensions/memory/index.ts`, `extensions/memory/inject.ts`, `extensions/memory/stats.ts`, `extensions/memory/test/inject.test.ts`, `extensions/memory/test/stats.test.ts`
- **Depends on:** Task 2
- **Mode:** sequential
- **Steps:** register the tools, commands and handlers. On `session_start`, create the repo `core.md` stub if missing and notify. Inject global plus repo `core.md` through `context`, the same text every call. Record ids searched or read through `memory_search` in `.stats.json`. Give `memory_search` a `promptSnippet`, then drop the qmd/ffgrep fallback line from `SYSTEM.md`. Confirm three things: `context`-injected messages are not persisted; the handler composes with condensed-milk's and pi-vcc's `context` handlers; the system prompt stays byte-identical.
- **Automated verification:** tests for stub creation (only once, never inside the repo), the injected block being identical across calls, the 300-token cap, and stats recording
- **Manual verification:** start Pi in a new repo and see the stub notice; the session file has no memory block; `/memory status` shows search counts

## Task 5: Commands, inbox and review
- **Files owned:** `extensions/memory/commands.ts`, `extensions/memory/test/commands.test.ts`
- **Depends on:** Task 3, Task 4
- **Mode:** sequential
- **Steps:** `/memory save`, `/memory review` (interactive approve, edit, reject, merge), `/memory status`.
- **Automated verification:** tests for inbox approval moving a note and committing
- **Manual verification:** review one candidate interactively

## Task 6: Extraction at compaction
- **Files owned:** `extensions/memory/extract.ts`, `extensions/memory/test/extract.test.ts`
- **Depends on:** Task 5
- **Mode:** sequential
- **Steps:** a `session_before_compact` handler, fire and forget, using `ctx.modelRegistry.complete` with `anthropic/claude-haiku-5-5`. Validate the schema, scan for secrets and write to `inbox/`. It must never return a compaction result.
- **Automated verification:** tests with a stubbed model, covering bad JSON, secrets, the inbox-only path and that the result is `undefined`
- **Manual verification:** trigger `/compact` and confirm the candidates appear and pi-vcc's summary is unchanged

## Task 7: Lint and confidence
- **Files owned:** `extensions/memory/lint.ts`, `extensions/memory/test/lint.test.ts`
- **Depends on:** Task 2
- **Mode:** parallel-safe
- **Steps:** the checks listed under Commands, a decay step for `review_after`, and interactive actions.
- **Automated verification:** tests for each check on fixture notes
- **Manual verification:** run `/memory lint` on the seeded store

## Task 8: Seed and document
- **Files owned:** `extensions/memory/README.md`, `~/.pi/memory/global/core.md`
- **Depends on:** Task 4, Task 5, Task 6, Task 7
- **Mode:** sequential
- **Steps:** seed `core.md` with about 10 lasting preferences (each with a `why`), including: "`.pi/` is ignored in every repo by `~/.config/git/ignore`; never add it to a project's `.gitignore`" (why: memories must never reach a remote). Keep model-facing behavior in tool metadata and write storage details in the README.
- **Automated verification:** `/memory lint` reports no issues on the seed
- **Manual verification:** one week of normal use, then check the token totals and inbox quality

## What we're NOT doing in v0

- Per-run search injection (only the two `core.md` files are injected; revisit after measuring).
- Any memory file inside a project repo.
- Embeddings or vector search (qmd stays available manually).
- Backfilling the 150 old sessions.
- Obsidian integration. The store is Obsidian-compatible, so open it as a vault anytime.
- Graphify or ICM.
- Sync between machines.
