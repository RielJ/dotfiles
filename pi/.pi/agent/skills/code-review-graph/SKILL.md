---
description: "Tree-sitter knowledge graph for code review and blast radius analysis. Use when reviewing PRs, analyzing change impact, or exploring unfamiliar codebases. Triggers on 'review changes', 'blast radius', 'what would break', 'impact analysis', or 'code-review-graph'."
---

# Code Review Graph

Tree-sitter powered knowledge graph for code review and impact analysis.
Builds a structural map of any codebase and computes blast radius for changes.

## When to Use

- Before reviewing code changes or PRs — run `detect-changes` to find blast radius
- When you need to understand which files are affected by a change
- When exploring a large/unfamiliar codebase — run `status` to see structure
- When asked to review a commit or set of changes
- When asked "what would this change break?" or "what's the impact?"

## Prerequisites

Installed via `pipx install code-review-graph` (v2.3.2+).

## Commands

### Build the graph (first time per project)

```bash
code-review-graph build
```

This parses the entire codebase with Tree-sitter and stores the graph in `.code-review-graph/graph.db` (SQLite). Takes ~10s for a 500-file project. Only needs to run once — after that, use `update`.

### Incremental update (after changes)

```bash
code-review-graph update
```

Re-parses only changed files. Completes in <2s for most projects.

### Detect change impact (blast radius)

```bash
code-review-graph detect-changes
```

Analyzes uncommitted changes (git diff) and shows:
- Which files are directly changed
- Which functions/classes are affected
- Which callers, dependents, and tests are in the blast radius
- Risk scores per file

This is the most useful command. Run it before any code review.

### Detect impact for a specific commit

```bash
code-review-graph detect-changes --commit HEAD~1
```

### Graph status

```bash
code-review-graph status
```

Shows graph statistics: file count, node count, edge count, communities, language breakdown.

### Watch mode (auto-rebuild)

```bash
code-review-graph watch
```

Runs in the background, auto-updates graph on file saves and git commits.

### Visualize (interactive HTML)

```bash
code-review-graph visualize
```

Generates a D3.js force-directed graph visualization. Opens in browser.

## Workflow

### For code reviews:

1. Run `code-review-graph update` to refresh the graph
2. Run `code-review-graph detect-changes` to see blast radius
3. Read ONLY the files in the blast radius — skip everything else
4. Focus review on high-risk files (callers of changed functions, untested dependents)

### For understanding unfamiliar code:

1. Run `code-review-graph build` (first time)
2. Run `code-review-graph status` to see structure
3. Use the blast radius to navigate — don't read the entire codebase

## Supported Languages

23 languages: Python, TypeScript/TSX, JavaScript, Vue, Svelte, Go, Rust, Java, Scala, C#, Ruby, Kotlin, Swift, PHP, Solidity, C/C++, Dart, R, Perl, Lua, Zig, PowerShell, Julia, plus Jupyter notebooks.

## Key Benefit

Instead of reading entire directories (thousands of tokens), read only the blast radius (~5-15 files). Average 8.2x token reduction across real repositories.

## Graph Storage

The graph is stored at `.code-review-graph/graph.db` in the project root. Add `.code-review-graph/` to `.gitignore`.
