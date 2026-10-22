# How people build agent "second brains" (2025-2026)

Research date: 2026-10-15. Companion to [memory-extension.md](memory-extension.md), whose §5 design this revises. Every claim about other people's setups has a source. Sections marked **Proposal** are mine.

## Summary

- **Most setups copy Karpathy's "LLM wiki"** ([gist](https://gist.github.com/karpathy/442a6bf555914893e9891c11519de94f)):
  - immutable `raw/` sources and an agent-written `wiki/`;
  - a schema file (`CLAUDE.md` or `AGENTS.md`);
  - an `index.md` catalog and an append-only `log.md`;
  - three operations: ingest, query, lint.

  Obsidian is only the viewer, and qmd is the suggested search tool.
- **The serious split is over who writes the memory.**
  - Karpathy and basic-memory let the agent write while the human reviews.
  - Steph Ango (Obsidian's CEO) refuses: "Don't delegate understanding" ([stephango.com/vault](https://stephango.com/vault)).
  - Fully autonomous designs exist only in research (A-MEM).
- **What breaks in practice:**
  - instruction files that only grow;
  - stale agent-written notes;
  - memory poisoned through session summaries;
  - a personal vault leaking into agent workflows.
- **For us:** keep the plan, with five changes listed in §5. Every note records why it exists. Candidates need your approval. `core.md` has a hard cap. Agent memory stays separate from any personal notes. A weekly lint pass checks the notes.

## 1. Reference designs

| Design | Storage | Who writes | How the agent retrieves | Source |
|---|---|---|---|---|
| Karpathy LLM wiki | Markdown: `raw/`, `wiki/`, `index.md`, `log.md` | Agent writes the wiki; human curates sources | Reads `index.md` first, then specific pages; qmd at larger scale. Index alone "works surprisingly well" up to ~100 sources | [gist](https://gist.github.com/karpathy/442a6bf555914893e9891c11519de94f) |
| Steph Ango | Notes in vault root; `References/`, `Clippings/`, `Daily/` | Human only | Links, backlinks, quick switcher | [vault](https://stephango.com/vault), [file over app](https://stephango.com/file-over-app) |
| Tiago Forte | A 1,000-2,000 word "Master Prompt" plus PARA | Human | Loaded at session start | [buildingasecondbrain.com](https://buildingasecondbrain.com/ai-second-brain) |
| Claude Code memory | `CLAUDE.md` (human-written) plus auto memory (agent-written) | Both | Loaded at start; first 200 lines or 25 KB of auto memory | [docs](https://code.claude.com/docs/en/memory) |
| Anthropic context engineering | "Lightweight identifiers" loaded just in time; `NOTES.md` | Agent | Load small, search on demand | [post](https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents) |
| basic-memory | Markdown with observations and relations (4,205 stars, AGPL-3.0) | Both; auto-capture each turn | MCP search plus link traversal | [repo](https://github.com/basicmachines-co/basic-memory) |
| A-MEM | Zettelkasten notes that update their neighbors | Agent only | Link traversal | [paper](https://arxiv.org/abs/2502.12110) |
| Evergreen notes | Atomic, concept-oriented, densely linked | Human | Browsing links | [Matuschak](https://notes.andymatuschak.org/Evergreen_notes) |

**Where they agree:**
- Plain Markdown is the source of truth.
- Raw input is never edited.
- Context is a scarce resource.
- A human-written schema governs the agent.
- Search before answering.
- Memory must be inspectable (Simon Willison objects to opaque "memory dossiers": [post](https://simonwillison.net/2025/May/27/llm-tools/)).

## 2. What people actually run

| Setup | Shape | Notable detail | Source |
|---|---|---|---|
| eugeniughelbur/obsidian-second-brain (4,766 stars) | One vault shared by 8 agents, including Pi | `/obsidian-save` turns a conversation into about 5 linked notes; nightly cleanup and a weekly review | [repo](https://github.com/eugeniughelbur/obsidian-second-brain) |
| Okhlopkov | `projects/<name>/{overview,tasks,ideas}.md`, `ai-docs/`, `AGENTS.md` | Voice note → raw text → tasks → durable facts. Reported mistakes: AI rewriting raw notes, credentials in notes, long rules nobody reads | [blog](https://okhlopkov.com/second-brain-obsidian-claude-code/) |
| aquinas-protocol | `raw/claude-exports/auto/` filled by a SessionEnd/PreCompact hook; nightly ingest and lint under a lock | 6 required frontmatter fields, enforced by lint | [site](https://aquinas-protocol.github.io/second-brain/) |
| rkondoju | Karpathy layout plus PDF and transcript ingestion | Reports ~90% fewer tokens than feeding raw files; merges duplicates | [dev.to](https://dev.to/rkondoju/i-built-a-personal-second-brain-with-markdown-files-and-claude-code-heres-how-2m14) |
| khanxxy template (2 stars) | `NOW.md`, `Projects/<name>/HANDOFF.md`, daily work log | The session is unfinished until `NOW.md`, the handoff and the log are updated | [repo](https://github.com/khanxxy/obsidian-second-brain) |
| bswen | Two vaults: a private one in iCloud and an AI one in git | Split after syncing a whole personal vault to a server exposed private notes | [blog](https://docs.bswen.com/blog/2026-03-23-sync-obsidian-vault-git-ai-collaboration/) |

**Recurring patterns:**
- the `raw/` → `wiki/` pipeline;
- per-project `HANDOFF.md`;
- MCP bridges for GUI clients;
- voice capture;
- nightly lint jobs;
- one vault shared by several agents.

**Folder conventions:** `index.md`, `log.md`, `inbox/` and `projects/<name>/` are common. PARA is occasional, and Johnny Decimal was never seen. **Scale:** one report says performance degrades past about 4,000 notes ([innobu](https://www.innobu.com/en/articles/obsidian-claude-second-brain-knowledge-management.html)), which I couldn't verify.

## 3. What goes wrong

Ranked by how directly it affects us:

1. **Files that only grow.** Across 247,694 instruction lifetimes in 1,867 repos, agent instruction files more than tripled (+226%), and older rules got less likely to be deleted. A one-line comment on each rule explaining why it exists removed 99.3% of the excess in a controlled test, and improved instruction-following by up to 23.1% ([arXiv:2608.11095](https://arxiv.org/abs/2608.11095)).
2. **Memory poisoning through summaries.** A malicious webpage made an agent's session summary store injected instructions in long-term memory; they later leaked conversation history ([Unit 42](https://unit42.paloaltonetworks.com/indirect-prompt-injection-poisons-ai-longterm-memory/)). A survey reports that "agents designed to write and retrieve memory more aggressively are more exploitable" ([arXiv:2606.04329](https://arxiv.org/abs/2606.04329)).
3. **Context rot.** All 18 models Chroma tested got worse as the input grew ([Chroma](https://research.trychroma.com/context-rot)). Anthropic suggests keeping each `CLAUDE.md` under 200 lines ([docs](https://code.claude.com/docs/en/memory)).
4. **Stale agent-written notes.** Agent-written memory drifts after code changes, and notes from one worktree spill into another ([aident.ai](https://aident.ai/blog/audit-claude-code-auto-memory)).
5. **Private notes leaking.** A vault synced to a server exposed journals ([bswen](https://docs.bswen.com/blog/2026-03-23-sync-obsidian-vault-git-ai-collaboration/)). Cloud memory stores leaked PII in 75% of attacks ([arXiv:2605.09530](https://arxiv.org/pdf/2605.09530)).

**Evidence that small, curated memory pays:** an `AGENTS.md` cut median runtime by 28.6% and output tokens by 16.6% across 124 PRs, with similar task completion ([arXiv:2601.20404](https://arxiv.org/abs/2601.20404)).

## 4. Where our setup already stands

| Pattern people use | What we have |
|---|---|
| Search tool | qmd 2.0.1, fixed. It's the one Karpathy recommends, and has 30,401 stars |
| Handoff docs | `handoff` skill (`.pi/handoffs/`) |
| Recall of past sessions | pi-vcc |
| Human-written schema | `AGENTS.md`, with `<important if>` blocks and a table of what enforces each rule |
| Storage that stays local | `~/.pi/memory/`, ignored by the dotfiles repo since this session |

The missing piece is curated long-term memory with budgeted injection.

## 5. Revised design (Proposal)

Changes to [memory-extension.md §5](memory-extension.md):

```text
~/.pi/memory/                 ignored by dotfiles; its own git repo, no remote
  index.md                    one line per note: [[id]] type · summary (rebuilt by tool)
  log.md                      append-only: "## [YYYY-MM-DD] save|reject|lint | id"
  global/core.md              hard cap 300 tokens, loaded at session start
  global/notes/<id>.md
  repos/<owner>-<repo>/core.md
  repos/<owner>-<repo>/notes/<id>.md
  inbox/<ts>-<id>.md          candidates, never injected until approved
```

1. **Every note has a `why:` field.** Notes without one fail lint. This is the fix that worked in arXiv:2608.11095.
2. **Approval is required.** Candidates from compaction, or from sessions that read web pages or tool output, stay in `inbox/` until `/memory review`. Nothing goes from a summary straight into a loaded note (Unit 42).
3. **Hard caps.** `core.md` is capped at 300 tokens, and injection per run at 600. Saving a note that would exceed the cap fails and asks for a merge or deletion instead of growing the file.
4. **Weekly lint.** Lint checks for missing `why:`, contradictory pairs (two notes with neither superseding the other), orphans, notes past `review_after:`, and broken links. It writes a report and never edits notes itself (aquinas-protocol and Karpathy both do lint this way).
5. **Kept separate from personal notes.** If you start a personal Obsidian vault, it stays human-only and the agent never reads it. Agent memory stays in `~/.pi/memory` (Ango's rule, bswen's two-vault fix).

Note format:

```markdown
---
id: pnpm-only
type: preference
scope: repo:rielj-web-portfollio
summary: Use pnpm, never npm.
why: npm created a second lockfile and broke CI (2026-09-12).
supersedes: [[npm-ok]]
review_after: 2027-04-01
---
```

## 6. Alternatives worth a second look

These are separate from the main recommendation. Each one is a real tradeoff, not a cosmetic variation.

### A. Start with `index.md` only, add qmd later

- **Replaces:** the qmd search in v0's read path.
- **Why it's better:** Karpathy reports an index "works surprisingly well" up to ~100 sources and hundreds of pages. Our memory will start with a few dozen notes. With no search step, injection is deterministic: inject `core.md` and nothing else, and let the agent read `index.md` when it decides to. Each injection costs zero extra calls, and there's one fewer moving part.
- **Tradeoffs:** no ranked retrieval; the agent decides when to read the index, and may forget. Add qmd once the index passes about 150 lines.

### B. Node's built-in SQLite FTS5 instead of qmd for injection

- **Replaces:** shelling out to qmd on every run.
- **Why it's better:** `node:sqlite` with FTS5 works in-process on Node 22 and 24 (verified here). It has no native module to rebuild after a Node upgrade, unlike qmd's `better-sqlite3`, which caused this week's breakage, and no subprocess per turn. Keyword search is enough for short, typed notes.
- **Tradeoffs:** no semantic search or reranking. We'd maintain a small indexer. qmd stays available for deliberate searches.

### C. Try `pi-memory` before building our own

- **Replaces:** writing v0.
- **Why it's better:** it's an existing Pi package that stores Markdown with `[[wikilinks]]` and uses qmd for selective injection ([pi.dev](https://pi.dev/packages/pi-memory)), so it costs zero code to try.
- **Tradeoffs:** no `why:` field, no approval queue, no repo scoping. My earlier research said it injects by changing the system prompt each turn, which would break the prompt cache, but I haven't confirmed that in its source. It writes to `~/.pi/agent/memory`, which the dotfiles repo tracks. **That would need an ignore rule first.**

### D. Fold memory into the existing `handoff` skill and `AGENTS.md`

- **Replaces:** the whole extension.
- **Why it's better:**
  - The cheapest option, and the one with the strongest evidence: a small, human-curated `AGENTS.md` measurably saves tokens (arXiv:2601.20404).
  - Lasting preferences go in `AGENTS.md` with `why:` comments; work in progress goes in handoffs.
  - Nothing is injected automatically, so there's nothing to poison.
- **Tradeoffs:** no memory scoped by repo outside each repo's `AGENTS.md`, which you want to avoid writing into repos. It also relies on you keeping `AGENTS.md` small.

**My pick: B + A for v0.** That is `core.md` plus `index.md` and an in-process FTS5 index, with qmd kept for manual deep searches. C is worth a one-hour trial if you'd rather not build anything yet, but add the ignore rule first.

## 7. Unverified

- The engagement numbers the community report quoted for Karpathy's gist (14k stars, 1.9k forks): the gist page shows "5,000+", and the API failed.
- innobu's claim about degradation past 4,000 notes, and its MCP RCE report.
- Reddit threads, which were rate-limited, so community sentiment here comes from blogs that cite Reddit rather than from the threads themselves.
