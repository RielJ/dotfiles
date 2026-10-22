/**
 * Keyword search over memory notes with Node's built-in SQLite FTS5.
 *
 * The index (.index.sqlite) is a cache: it is rebuilt from the Markdown files
 * whenever any note changes, so the files stay the only source of truth.
 */
import { statSync } from "node:fs";
import { join } from "node:path";
import type { DatabaseSync as DatabaseSyncType } from "node:sqlite";
import { createRequire } from "node:module";
import { type Confidence, estimateTokens, listNotes, memoryRoot, type Note, type Scope } from "./store.ts";

// node:sqlite prints an ExperimentalWarning on some Node versions; load it lazily.
const require = createRequire(import.meta.url);
function openDb(path: string): DatabaseSyncType {
	const { DatabaseSync } = require("node:sqlite") as typeof import("node:sqlite");
	return new DatabaseSync(path);
}

export interface SearchOptions {
	/** Scopes to search, e.g. ["global", "repo:owner-repo"]. Default: all. */
	scopes?: Scope[];
	/** Include low-confidence notes. Default false. */
	includeLow?: boolean;
	/** Max results before budgeting. Default 8. */
	limit?: number;
	/** Token budget for the formatted output. Default 600. */
	budget?: number;
	/** Follow `relates` links one hop. Default true. */
	expand?: boolean;
}

export interface SearchHit {
	note: Note;
	/** Lower is better (bm25). Expanded neighbours get +Infinity. */
	rank: number;
	viaLink?: string;
}

const RANK: Record<Confidence, number> = { high: 0, medium: 1, low: 2 };

function fingerprint(notes: Note[]): string {
	return notes
		.map((n) => {
			try {
				return `${n.path}:${statSync(n.path as string).mtimeMs}`;
			} catch {
				return `${n.path}:gone`;
			}
		})
		.sort()
		.join("|");
}

/** Turn free text into a safe FTS5 OR query of word prefixes. */
export function toFtsQuery(text: string): string {
	const words = [...new Set(text.toLowerCase().match(/[a-z0-9]{2,}/g) ?? [])].slice(0, 24);
	return words.map((w) => `"${w}"*`).join(" OR ");
}

export class MemoryIndex {
	private root: string;
	private db: DatabaseSyncType;
	private notes = new Map<string, Note>();
	private print = "";

	constructor(root = memoryRoot(), dbPath = join(root, ".index.sqlite")) {
		this.root = root;
		this.db = openDb(dbPath);
		this.db.exec(
			"CREATE VIRTUAL TABLE IF NOT EXISTS notes USING fts5(id UNINDEXED, summary, why, body, type, scope UNINDEXED, tokenize='porter unicode61')",
		);
	}

	/** Rebuild from disk if any note was added, removed or edited. */
	refresh(): void {
		const notes = listNotes(this.root);
		const print = fingerprint(notes);
		if (print === this.print) return;
		this.db.exec("DELETE FROM notes");
		const insert = this.db.prepare("INSERT INTO notes (id, summary, why, body, type, scope) VALUES (?, ?, ?, ?, ?, ?)");
		this.notes.clear();
		for (const n of notes) {
			this.notes.set(n.id, n);
			insert.run(n.id, n.summary, n.why, n.body, n.type, n.scope);
		}
		this.print = print;
	}

	get(id: string): Note | undefined {
		this.refresh();
		return this.notes.get(id);
	}

	all(): Note[] {
		this.refresh();
		return [...this.notes.values()];
	}

	search(query: string, opts: SearchOptions = {}): SearchHit[] {
		this.refresh();
		const fts = toFtsQuery(query);
		if (!fts) return [];
		const superseded = new Set([...this.notes.values()].flatMap((n) => n.supersedes));
		const eligible = (n: Note | undefined): n is Note =>
			!!n &&
			!superseded.has(n.id) &&
			(opts.includeLow || n.confidence !== "low") &&
			(!opts.scopes || opts.scopes.includes(n.scope));

		const rows = this.db
			.prepare("SELECT id, bm25(notes, 0, 4.0, 2.0, 1.0, 0.5) AS rank FROM notes WHERE notes MATCH ? ORDER BY rank LIMIT 50")
			.all(fts) as { id: string; rank: number }[];

		const hits: SearchHit[] = [];
		for (const row of rows) {
			const note = this.notes.get(row.id);
			if (eligible(note)) hits.push({ note, rank: row.rank });
		}
		hits.sort((a, b) => a.rank - b.rank || RANK[a.note.confidence] - RANK[b.note.confidence]);
		const top = hits.slice(0, opts.limit ?? 8);

		if (opts.expand !== false) {
			const seen = new Set(top.map((h) => h.note.id));
			for (const hit of [...top]) {
				for (const id of hit.note.relates) {
					const linked = this.notes.get(id);
					if (eligible(linked) && !seen.has(id)) {
						seen.add(id);
						top.push({ note: linked, rank: Number.POSITIVE_INFINITY, viaLink: hit.note.id });
					}
				}
			}
		}
		return top;
	}

	close(): void {
		this.db.close();
	}
}

/** One line per hit, cut off at the token budget. */
export function formatHits(hits: SearchHit[], budget = 600): { text: string; ids: string[]; truncated: number } {
	const lines: string[] = [];
	const ids: string[] = [];
	let used = 0;
	for (const { note, viaLink } of hits) {
		const via = viaLink ? ` (via [[${viaLink}]])` : "";
		const line = `- [[${note.id}]] ${note.type} · ${note.confidence} · ${note.scope} · ${note.summary} — why: ${note.why}${via}`;
		const cost = estimateTokens(line) + 1;
		if (used + cost > budget) break;
		lines.push(line);
		ids.push(note.id);
		used += cost;
	}
	return { text: lines.join("\n"), ids, truncated: hits.length - ids.length };
}
