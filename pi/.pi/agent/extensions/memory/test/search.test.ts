import assert from "node:assert/strict";
import { mkdtempSync, rmSync, utimesSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, it } from "node:test";
import { formatHits, MemoryIndex, toFtsQuery } from "../search.ts";
import { ensureLayout, type Note, writeNote } from "../store.ts";

const dirs: string[] = [];
const indexes: MemoryIndex[] = [];
afterEach(() => {
	for (const i of indexes.splice(0)) i.close();
	for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

function note(id: string, extra: Partial<Note> = {}): Note {
	return {
		id,
		type: "fact",
		scope: "global",
		summary: `summary for ${id}`,
		why: "because",
		confidence: "medium",
		source: "user",
		created: "2026-10-15",
		supersedes: [],
		relates: [],
		body: "",
		...extra,
	};
}

function store(notes: Note[]): { root: string; index: MemoryIndex } {
	const root = mkdtempSync(join(tmpdir(), "mem-search-"));
	dirs.push(root);
	ensureLayout(root);
	for (const n of notes) writeNote(root, n);
	const index = new MemoryIndex(root);
	indexes.push(index);
	return { root, index };
}

describe("search", () => {
	it("builds a safe OR query from free text", () => {
		assert.equal(toFtsQuery('Use "pnpm" not npm!'), '"use"* OR "pnpm"* OR "not"* OR "npm"*');
		assert.equal(toFtsQuery("?!"), "");
	});

	it("ranks summary matches and filters scope, low confidence and superseded notes", () => {
		const { index } = store([
			note("pnpm-only", { summary: "Use pnpm for installs", scope: "repo:a" }),
			note("lockfile", { summary: "Lockfile notes", body: "pnpm creates pnpm-lock.yaml", scope: "repo:a" }),
			note("other-repo", { summary: "Use pnpm here too", scope: "repo:b" }),
			note("weak", { summary: "pnpm maybe", confidence: "low" }),
			note("old", { summary: "Use npm for installs", scope: "repo:a" }),
			note("new", { summary: "Use pnpm workspaces", supersedes: ["old"], scope: "repo:a" }),
		]);
		const ids = index.search("pnpm installs", { scopes: ["global", "repo:a"] }).map((h) => h.note.id);
		assert.equal(ids[0], "pnpm-only");
		assert.ok(ids.includes("lockfile"));
		assert.ok(!ids.includes("other-repo"), "other scope excluded");
		assert.ok(!ids.includes("weak"), "low confidence excluded by default");
		assert.ok(!ids.includes("old"), "superseded excluded");
		assert.ok(index.search("pnpm", { includeLow: true }).some((h) => h.note.id === "weak"));
	});

	it("expands one hop along relates", () => {
		const { index } = store([
			note("deploy", { summary: "Deploy with vercel", relates: ["env-vars"] }),
			note("env-vars", { summary: "Secrets live in 1Password" }),
		]);
		const hits = index.search("deploy");
		assert.deepEqual(
			hits.map((h) => [h.note.id, h.viaLink]),
			[
				["deploy", undefined],
				["env-vars", "deploy"],
			],
		);
		assert.equal(index.search("deploy", { expand: false }).length, 1);
	});

	it("refreshes when a note changes on disk", () => {
		const { root, index } = store([note("a", { summary: "alpha" })]);
		assert.equal(index.search("beta").length, 0);
		const path = writeNote(root, note("b", { summary: "beta" }));
		utimesSync(path, new Date(), new Date(Date.now() + 1000));
		assert.equal(index.search("beta")[0]?.note.id, "b");
	});

	it("formats hits within the token budget", () => {
		const { index } = store(Array.from({ length: 10 }, (_, i) => note(`n${i}`, { summary: `widget fact ${i} ${"x".repeat(80)}` })));
		const hits = index.search("widget", { limit: 10 });
		const out = formatHits(hits, 100);
		assert.ok(out.ids.length > 0 && out.ids.length < 10);
		assert.equal(out.truncated, 10 - out.ids.length);
		assert.ok(out.text.length / 4 <= 100);
		assert.match(out.text, /^- \[\[n\d\]\] fact · medium · global · widget fact/);
	});
});
