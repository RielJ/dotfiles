# memory

Local long-term memory for Pi. Notes are plain Markdown in `~/.pi/memory/`, a local git repo with no remote. Nothing is written inside project repos.

Design and decisions: [docs/plans/memory-v0.md](../../docs/plans/memory-v0.md).

## What it does

- **Session start:** creates `~/.pi/memory/repos/<owner>-<repo>/core.md` the first time you open a repo (keyed by the `origin` remote, so every worktree shares it). It then prepends global `core.md` plus the repo's `core.md` (300 tokens each, at most) to every model request. The block is identical for the whole session and never written to the session file.
- **Tools:**
  - `memory_search` searches high- and medium-confidence notes within a 600-token result budget. Pass a returned `id` to the same tool to read that note in full.
  - `memory_write` saves one claim with a `why`.
- **Compaction:** sends the dropped messages to `anthropic/claude-haiku-5-5` and queues candidate memories in `inbox/`. It doesn't block compaction or replace pi-vcc's summary.
- **`/memory`:**
  - `save <text>` saves a note or a `core.md` rule;
  - `review` approves, edits or rejects inbox candidates;
  - `lint` is the weekly check of weak memories;
  - `status` shows counts and token use.

## Write policy

| Who | Clean session | Session that read outside content |
|---|---|---|
| You (`/memory save`, or asked the agent to remember) | saved, high confidence | saved |
| Agent decides it matters | saved, medium confidence | `inbox/` |
| Compaction extraction | `inbox/` | `inbox/` |

"Outside content" means `web_search`, `web_read`, browser and fetch tools, or `bash` with `curl`, `wget` or `gh api`. Text that looks like a credential is always refused.

## Store layout

```text
~/.pi/memory/
  index.md, log.md            generated catalog, append-only log
  global/core.md, global/notes/<id>.md
  repos/<owner>-<repo>/core.md, repos/<owner>-<repo>/notes/<id>.md
  inbox/<stamp>-<id>.md
  lint-report.md              last /memory lint report
  .index.sqlite, .stats.json  caches, not committed
```

The extension commits to `~/.pi/memory` after every change (unsigned, no remote). That is the only repo it commits to. `PI_MEMORY_DIR` overrides the location.

## Tests

```bash
cd ~/.pi/agent/extensions/memory && node --test test/*.test.ts
```
