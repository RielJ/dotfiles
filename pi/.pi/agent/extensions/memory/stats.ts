/** Usage counts per note (.stats.json, not committed). Lint uses them to find unused notes. */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { today } from "./store.ts";

export interface NoteStats {
	searched: number;
	read: number;
	/** YYYY-MM-DD of the last search hit or read. */
	last: string;
}

export interface StatsFile {
	notes: Record<string, NoteStats>;
	/** Tokens injected per day by the core block, for /memory status. */
	injected: Record<string, number>;
}

export function statsPath(root: string): string {
	return join(root, ".stats.json");
}

export function loadStats(root: string): StatsFile {
	try {
		const parsed = JSON.parse(readFileSync(statsPath(root), "utf8")) as Partial<StatsFile>;
		return { notes: parsed.notes ?? {}, injected: parsed.injected ?? {} };
	} catch {
		return { notes: {}, injected: {} };
	}
}

function save(root: string, stats: StatsFile): void {
	if (!existsSync(root)) return;
	writeFileSync(statsPath(root), JSON.stringify(stats, null, 2));
}

export function recordUse(root: string, ids: string[], kind: "searched" | "read", now = new Date()): void {
	if (!ids.length) return;
	const stats = loadStats(root);
	const date = today(now);
	for (const id of ids) {
		const entry = stats.notes[id] ?? { searched: 0, read: 0, last: date };
		entry[kind]++;
		entry.last = date;
		stats.notes[id] = entry;
	}
	save(root, stats);
}

export function recordInjection(root: string, tokens: number, now = new Date()): void {
	const stats = loadStats(root);
	const date = today(now);
	stats.injected[date] = (stats.injected[date] ?? 0) + tokens;
	save(root, stats);
}
