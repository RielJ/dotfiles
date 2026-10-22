# Persistent memory for Pi: Obsidian, Graphify, and ICM

Research date: 2026-10-15. Every claim about an existing tool carries a source. Sections marked **Proposal** are design recommendations, not facts.

## Summary

- Build our own Pi extension, but keep it small. Use a plain Markdown vault as the single source of truth, Obsidian as an optional viewer, wikilinks with typed frontmatter for edges, and qmd (already installed) for retrieval.
- **Graphify is the wrong tool for agent memory.** It builds code and document graphs. Use it, if at all, as a separate per-repo code-navigation aid, and only after measuring it. It already ships its own Pi extension.
- **Leave ICM out of v1.** It is a capable memory engine, but it stores memory in its own SQLite database. That creates a second source of truth next to the vault and duplicates qmd's job. Revisit it only if we decide to move the source of truth into SQLite.
- The token savings come from budgeted, on-demand retrieval of short atomic notes, injected after the cached prompt prefix. Bigger tools don't buy that.

## 1. Disambiguation

| Name in brief | Candidates found | Assumed | Why |
|---|---|---|---|
| Graphify | Graphify-Labs/graphify ([repo](https://github.com/Graphify-Labs/graphify)); safishamsi/graphify (redirects to it); ChingonaAI/graphify-knowledge-graph ([repo](https://github.com/ChingonaAI/graphify-knowledge-graph), an old v3 mirror); graphify.com / graphify.net (the same company's sites) | **Graphify-Labs/graphify** | Every domain, badge, and PyPI reference (`graphifyy`) points to it. GitHub API on 2026-10-15: 126,567 stars, Apache-2.0, 1,491 open issues |
| ICM | rtk-ai/icm, "Infinite Context Memory" ([repo](https://github.com/rtk-ai/icm)); no other agent-memory project uses the name | **rtk-ai/icm** | Only match. GitHub API: 581 stars, Apache-2.0, last push 2026-10-13 |
| Obsidian | Obsidian app, its Local REST API plugin, and the official CLI ([obsidian.md/cli](https://obsidian.md/cli)) | Vault as plain Markdown | See §3 |

## 2. Prior art

### Pi extensions

| Project | Storage | Write path | Injection | Source |
|---|---|---|---|---|
| pi-mem | `MEMORY.md`, `SCRATCHPAD.md`, `daily/` | Agent tools | Everything, every turn, via `before_agent_start` | [blog](https://pradeep.md/2026/02/11/pi-mem.html) |
| pi-memory (described as the most popular Pi memory extension) | Same three tiers in `~/.pi/agent/memory/`, using `#tags` and `[[wikilinks]]` | 6 agent tools | Full injection, or selective injection when qmd is installed | [pi.dev](https://pi.dev/packages/pi-memory) |
| pi-obsidian-memory | Same layout inside an Obsidian vault; Sync, Syncthing, or git carry it between machines | 7 tools, `/rule` and `/memory` commands | Same as pi-memory. No cross-process locking | [repo](https://github.com/the-matt-moo/pi-obsidian-memory) |
| pi-hermes-memory | Markdown files plus SQLite FTS5 | Background loop every 10 turns, correction detection, secret scanning | Short policy block; the agent searches on demand | [repo](https://github.com/chandra447/pi-hermes-memory) |
| db0 | SQLite (or Postgres) | Automatic extraction on `turn_end` | `before_agent_start`, `tokenBudget` default 1500 | [db0.ai](https://db0.ai/integrations/pi) |
| CanerGngr/pi-obsidian-extensions | Vault via the Local REST API (app must run) | Session notes on shutdown | Relevant sessions on startup | [repo](https://github.com/CanerGngr/pi-obsidian-extensions) |
| pi-memory-extension | `MEMORY.md`, global and workspace | Human approval only | Every turn | [pi.dev](https://pi.dev/packages/pi-memory-extension) |

### Other memory systems

- **Anthropic memory tool:** client-side `/memories` files that the model reads only when needed ([docs](https://platform.claude.com/docs/en/agents-and-tools/tool-use/memory-tool)).
- **basic-memory:** Markdown files with wikilinks forming a graph, readable in Obsidian ([docs](https://docs.basicmemory.com/integrations/obsidian/)).
- **Zep / Graphiti:** temporal knowledge graph where facts carry validity periods. Reports 71.2% on LongMemEval vs. 60.2% for full context ([paper](https://arxiv.org/abs/2501.13956)).
- **Mem0:** reports under 7,000 tokens per retrieval vs. 25,000+ for full context ([blog](https://mem0.ai/blog/mem0-the-token-efficient-memory-algorithm), [paper](https://arxiv.org/abs/2504.19413)).
- **A-MEM:** Zettelkasten notes that update their neighbors when new notes arrive ([paper](https://arxiv.org/abs/2502.12110)).
- **Karpathy's "LLM wiki":** the agent maintains topic files and reads them on demand ([gist](https://gist.github.com/karpathy/442a6bf555914893e9891c11519de94f)).

### What the evidence says

- Injecting everything every turn works at small sizes, then costs climb with memory size. Every mature system adds selective retrieval (pi-memory, db0, Mem0).
- Stale facts and contradictions are the main way memory quality fails. Systems that model validity in time score highest on LongMemEval (Zep paper above).
- Memory loaded into context is a prompt-injection path. pi-hermes-memory scans for secrets before storing.

## 3. Components

### Obsidian (storage and human view)

- **Ways to access it:**
  - Local REST API plugin ([repo](https://github.com/coddingtonbear/obsidian-local-rest-api)): needs the app running and an API key.
  - Official CLI ([obsidian.md/cli](https://obsidian.md/cli)): "the Obsidian app must be running."
  - Direct file I/O: works without the app.
- **On this machine:** Obsidian is not installed (no app, no vault config).
- **Role (Proposal):** a folder of Markdown files with YAML frontmatter and `[[wikilinks]]`, read and written directly. The app is an optional viewer for browsing, editing, and the graph view. Never make the agent depend on the app running.

### Graphify (code graph, not memory)

Verified from source (`/tmp/mem-research/graphify`, commit `10130e7`, v0.9.91) and its [docs](https://docs.graphify.com):

- **Graph:** nodes are functions, classes, modules, and concepts from docs. Edges include `calls`, `imports`, `inherits`, `references` and `semantically_similar_to`, each tagged `EXTRACTED` or `INFERRED`.
- **How edges are built:** code uses a tree-sitter AST pass with no LLM; docs and media need an LLM pass.
- **Outputs:** `graph.json` (NetworkX), `GRAPH_REPORT.md`, `graph.html`. It also has an `--obsidian` export, one note per node with wikilinks.
- **Access:** a CLI (`query`, `path`, `explain`, `update`, `--watch`, git hooks) and an MCP server with 10 tools. `query_graph` takes a `token_budget`, which defaults to 2000.
- **Pi support:** `graphify/pi/index.ts` (190 lines) hooks `tool_call` and steers Pi away from `read`/`grep`/`find` toward the graph, via `sendMessage(..., { deliverAs: "steer" })`.
- **Privacy:** no telemetry. The query log is opt-in (`graphify/querylog.py:16-31`).
- **Token claims:** the "71.5x fewer tokens" figure comes from a per-query benchmark. KubeBlogs ran 6 real Claude Code sessions and saw no dramatic savings across a full session, describing the result as "directional evidence" ([article](https://www.kubeblogs.com/graphify-claims-71-5x-fewer-tokens-we-tested-it-on-real-production-work/)). Open issues report false edges in JavaScript and Rust (#4448, #4439).
- **Fit:** it graphs code and documents, not decisions or preferences. Its "lessons" feature (`save-result` and `reflect`) only records what the agent explicitly logs. It also overlaps with tools already installed here: pi-lens (`symbol_search`, `module_report` blast radius) and the `code-review-graph` skill.

### ICM (memory engine)

Verified from source (`/tmp/mem-research/icm`, commit `5f40243`) and [docs/architecture.md](https://github.com/rtk-ai/icm/blob/main/docs/architecture.md):

- **Packaging:** a single Rust binary. Storage is SQLite with FTS5 and sqlite-vec.
- **Memory model:** episodic memories carry importance levels and decay with use. "Memoirs" form a concept graph with 9 typed relations, including `contradicts` and `superseded_by`.
- **Retrieval:** recall fuses keyword (BM25), vector and time-based results (Reciprocal Rank Fusion). Output is compact (TOON format) and fits a `max_tokens` budget.
- **Embeddings:** optional local ONNX. The default model is about 2 GB.
- **LLM use:** none to store or recall. An LLM is only needed for automatic extraction and consolidation.
- **Pi support:** `icm init` writes instructions to `~/.pi/agent/AGENTS.md` and adds two skills. The Pi hook extension is listed as "TS ext (TBD)" ([reference.md:90](https://github.com/rtk-ai/icm/blob/main/docs/reference.md)).
- **Network:** no telemetry. Network calls happen only for an explicit `icm upgrade`, the ONNX runtime or model download, and the opt-in LLM summarizer providers (`crates/icm-cli/src/{upgrade,ort_runtime,summarizer}.rs`).
- **Maturity:** pre-1.0, and minor releases may break things. Mostly one maintainer, whose "main focus is rtk." Recent fixes include dedup data loss and inverted BM25 scoring (`crates/icm-cli/CHANGELOG.md`, 0.10.64 and 0.10.62).
- **Benchmarks:** self-run LoCoMo numbers (92.9%, 24.1k tokens per question) using a competitor's harness (README).

### Pi extension surface

Verified in `@earendil-works/pi-coding-agent` 1.0.1 (`dist/core/extensions/types.d.ts`, `docs/extensions.md`, `docs/compaction.md`):

| Need | API | Notes |
|---|---|---|
| Inject memory before a run | `before_agent_start` returns `{ message }` or `{ systemPrompt }` (`types.d.ts:1088-1092`) | Changing `systemPrompt` invalidates the prompt cache; a custom `message` does not |
| Rewrite context per call | `context` returns `{ messages }` (`types.d.ts:1045`) | Runs before every model call |
| Tools | `registerTool` with `promptSnippet`, `promptGuidelines` | Snippet text is static, so it stays cache-friendly |
| Read compaction input | `session_before_compact` gives `preparation.messagesToSummarize` and `previousSummary` | All handlers run; the last non-empty result wins (`dist/core/extensions/runner.js:813-838`). Returning nothing leaves pi-vcc's summary in place |
| Cheap model calls | `ctx.modelRegistry.complete(model, ctx, opts)` (`examples/extensions/custom-compaction.ts:80`) | Use for extraction |
| Per-turn data | `turn_end`, `tool_result`, `session_shutdown` | `turn_end` can append session entries |
| Shell out | `pi.exec(cmd, args)` | How `superpowers/qmd.ts` calls qmd |

Pi has no built-in memory feature. Its docs mention memory only in unrelated contexts.

## 4. What's already on this machine

- **pi-vcc** recalls content within and across sessions and replaces compaction (`pi-vcc-config.json: overrideDefaultCompaction: true`). Memory should cover what lasts across sessions and leave in-session recall to vcc.
- **condensed-milk** masks old tool results, and **caveman-milk** shortens output.
- **qmd 2.0.1** works again (2026-10-15). It had been broken because its `better-sqlite3` was built for Node 25 (module ABI 141) and Homebrew upgraded `node` to 26. Node now comes only from fnm (24 LTS), and global CLIs are reinstalled from `dotfiles/node/globals.txt`.
- **Session history:** 150 Pi sessions, 394 MB, in `~/.pi/agent/sessions/`. That's raw material for backfilling memory.

## 5. Proposed architecture (Proposal)

```text
Pi session
  ├─ before_agent_start ──► retrieve(prompt) ──► custom message "memory" (≤ budget)
  ├─ tools: memory_search · memory_get · memory_write · memory_link
  ├─ session_before_compact ──► extract candidates (cheap model) ──► inbox/
  └─ session_shutdown ──► daily log line + flush queue
            │
            ▼
Vault (plain Markdown, git-tracked, Obsidian-compatible)
  ~/memory/
    core.md            ≤ 300 tokens, always loaded, changes rarely
    notes/<slug>.md    one claim per note, frontmatter + wikilinks
    inbox/<ts>.md      extracted candidates awaiting promotion
    daily/YYYY-MM-DD.md
            │
            ▼
qmd collection "memory" (BM25 + vector + rerank), rebuilt in background
```

### Note format

```markdown
---
id: pnpm-only
type: preference        # preference | decision | fact | gotcha | procedure
scope: global           # global | repo:<name>
summary: Use pnpm, never npm, in this repo.
supersedes: [[npm-ok]]
relates: [[web-portfolio]]
source: session 2026-10-14 (abc123)
created: 2026-10-14
confidence: high
---
Use pnpm for every install and script. npm creates a second lockfile that breaks CI.
```

- **Edges** are wikilinks in frontmatter with fixed keys: `supersedes`, `contradicts`, `depends_on`, `relates`. Obsidian's graph view shows them, and the extension parses them without a graph database.
- **Superseded notes** are never retrieved. That gives the time-validity behavior that Zep's results reward, using plain files.

### Write path

1. **Explicit writes.** `memory_write` covers "remember this" and the agent's own decisions. It runs a secret scan and checks for duplicates (qmd search on `summary`, then merge or link).
2. **Extraction at compaction.** In `session_before_compact`, send `messagesToSummarize` to a cheap model with a fixed schema (type, summary, body, links). Write the results to `inbox/` and return nothing, so pi-vcc's summary still applies.
3. **Promotion.** Inbox notes become `notes/` after review: `/memory review`, or automatically when they're high-confidence and repeat what an existing note says. This keeps the human veto that pi-memory-extension and Karpathy's wiki rely on.

### Read path

1. **Startup:** load `core.md` once at session start, as a custom message (the system prompt stays byte-stable).
2. **Every run:** search qmd with the user prompt, keep hits above a score threshold, and expand one hop along `relates` and `depends_on` links within the budget. Inject only `id: summary` lines (about 15 tokens each). Skip injection entirely when nothing clears the threshold.
3. **Detail on demand:** the agent calls `memory_get <id>` only when it needs a note's full body.

## 6. Token reduction

| Technique | How it applies here | Basis |
|---|---|---|
| Inject on demand, not everything | Threshold plus top-k, and inject nothing when nothing matches | pi-memory selective mode; Mem0's 7k vs. 25k figures |
| Summaries first, bodies on demand | Inject summary lines; full text only via `memory_get` | Anthropic memory tool reads only on demand |
| Hard budget | Default 600 tokens per run, configurable | db0 `tokenBudget` (1500), Graphify `token_budget` (2000), ICM `max_tokens` |
| Keep the prompt cache intact | Never change the system prompt per turn; send memory as a message after the cached prefix | `before_agent_start` return types; condensed-milk keeps its system-prompt text byte-identical (`index.ts:265-268`) |
| Graph-limited expansion | One hop over typed links instead of more search hits | Graphify and ICM both bound their subgraphs |
| Drop superseded facts | Fewer conflicting notes reach the context | Zep's validity periods |
| Atomic notes | One claim per note, at most about 120 words | A-MEM and Zettelkasten practice |
| Share the existing compaction pass | Extraction reuses pi-vcc's compaction trigger, so there's no extra pass over the transcript | Pi runs every handler (`runner.js:813`) |

## 7. Where we can beat existing extensions (Proposal)

- **Measure it.** Log tokens injected per run and how often an injected note is actually cited or used, and track it with pi-token-burden. None of the Pi extensions surveyed publish numbers.
- **Typed links and supersession,** which flat `MEMORY.md` files lack.
- **Cache-safe injection.** pi-mem and pi-memory change the system prompt every turn. We wouldn't.
- **Scoping by repo.** `scope: repo:<name>` filters at query time, so one vault serves every project.
- **Safe for parallel subagents.** Only the orchestrator promotes notes; subagents write only to `inbox/`. That avoids the single-writer limit pi-obsidian-memory documents.
- **Memory treated as untrusted data.** Wrap injected notes in a tagged block marked as data, refuse to store instruction-shaped text from tool output, and scan for secrets before writing.

## 8. ICM: does it belong?

**Not in v1.**

- **What ICM would add:** decay, deduplication, rank fusion, a typed concept graph, and a token budget, all in one maintained binary.
- **What it would cost:**
  - **Two sources of truth.** Memories live in SQLite, so Obsidian could only show exports. Markdown export exists only for memoirs (`icm memoir export --format ai`).
  - **Duplication.** qmd already handles hybrid search over Markdown.
  - **Weak Pi support.** Pi gets instructions and skills only; the hook extension is still "TBD."
  - **Instability.** Pre-1.0 breaking changes, with recent data-loss fixes.
- **When to revisit:** if the Markdown and qmd approach fails on retrieval quality, or if the vault grows past what qmd handles comfortably. At that point, consider ICM as the store and the vault as an export, not both side by side.

## 9. Open questions and risks

- **Vault location and sync:** a new `~/memory` git repo, a folder inside a future Obsidian vault, or `~/.pi/agent/memory`. Will you install Obsidian?
- **Extraction model and cost:** which cheap model, and is it acceptable to send compaction slices to it? The data never leaves your chosen provider.
- **Promotion policy:** manual review only, or automatic for high-confidence duplicates?
- **qmd setup:** the first embed downloads a model. After any fnm Node major upgrade, rerun `scripts/node-globals.sh` so native modules rebuild.
- **Memory poisoning:** memory read by every future session is an injection target. The mitigations in §7 reduce the risk but don't remove it.
- **Graphify per repo:** worth an A/B on one real repo, but separately from memory, and compared against pi-lens, which already offers similar navigation.
- **Retrieval false positives:** a bad threshold injects irrelevant notes on every run. Needs tuning against logged queries.

## 10. Recommended path

**Stack:** a plain Markdown vault (git-tracked, Obsidian-compatible), qmd for retrieval, and a custom extension, `extensions/memory/`. No ICM. Graphify stays out of the memory system.

**First steps:**

1. **Index the vault.** `qmd collection add ~/memory --name memory` (qmd is fixed).
2. **Create the vault layout** from §5 and seed `core.md` by hand with about 10 lasting preferences (pnpm vs. npm, git rules, terse style).
3. **Prototype v0 (read-only retrieval):** the `memory_search` and `memory_get` tools, plus `before_agent_start` injection of summary lines within a 600-token budget, with a log of what was injected. No automatic writes yet.
4. **Measure for a week.** Tokens injected per run, hit rate, and the share of runs with no injection. Adjust the threshold.
5. **v1:** `memory_write` with secret scanning and duplicate checks; extraction at compaction into `inbox/`; `/memory review` for promotion.
6. **v2:** supersession handling, repo scoping, and a one-time backfill from the 150 existing sessions using a cheap model, reviewed in batches.
7. **Separately, optional:** an A/B of Graphify on one repo, measured over full sessions.

**Prototype first:** step 3. It tests the main token claim (budgeted, cache-safe retrieval) with the least code, and it is read-only, so it can't corrupt anything.
