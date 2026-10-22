import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, it } from "node:test";
import {
	addCoreRule,
	commit,
	ensureLayout,
	ensureRepoCore,
	keyFromRemote,
	listInbox,
	listNotes,
	type Note,
	parseNote,
	promote,
	readCore,
	rebuildIndex,
	repoKey,
	serializeNote,
	uniqueId,
	writeNote,
} from "../store.ts";

const dirs: string[] = [];
afterEach(() => {
	for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});
function tmp(prefix = "mem-"): string {
	const d = mkdtempSync(join(tmpdir(), prefix));
	dirs.push(d);
	return d;
}
function sh(cwd: string, ...args: string[]): string {
	return execFileSync("git", ["-C", cwd, ...args], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
}

const sample: Note = {
	id: "pnpm-only",
	type: "preference",
	scope: "repo:rielj-web-portfollio",
	summary: "Use pnpm, never npm.",
	why: "npm created a second lockfile: CI broke (2026-09-12).",
	confidence: "high",
	source: "user",
	created: "2026-10-15",
	confirmed: "2026-10-15",
	review_after: "2027-04-15",
	supersedes: ["npm-ok"],
	relates: [],
	body: "Applies to install and scripts.",
};

describe("note format", () => {
	it("round-trips every field, including colons and links", () => {
		const parsed = parseNote(serializeNote(sample));
		assert.deepEqual({ ...parsed, path: undefined }, { ...sample, path: undefined });
	});

	it("round-trips quoted hashes, quotes, and backslashes without changing saved text", () => {
		for (const text of [
			"Use #production, never #staging",
			'Use "#production", never \'#staging\'',
			"Keep C:\\notes for #production",
		]) {
			const note = { ...sample, summary: text, why: text };
			assert.deepEqual(parseNote(serializeNote(note)), note);
		}
	});

	it("strips trailing comments without stripping quoted hashes or plain apostrophes", () => {
		const note = parseNote([
			"---",
			'id: hash-note # inline comment',
			'summary: "Use #production" # inline comment',
			"why: 'Don''t use #staging' # inline comment",
			"---",
		].join("\n"));
		assert.equal(note.id, "hash-note");
		assert.equal(note.summary, "Use #production");
		assert.equal(note.why, "Don't use #staging");
		assert.equal(parseNote("---\nsummary: Don't forget # comment\n---\n").summary, "Don't forget");
	});

	it("falls back to safe defaults for unknown values", () => {
		const note = parseNote("---\nid: x\ntype: banana\nconfidence: maybe\n---\n");
		assert.equal(note.type, "fact");
		assert.equal(note.confidence, "medium");
		assert.equal(note.scope, "global");
	});
});

describe("repo key", () => {
	it("parses ssh and https remotes", () => {
		assert.equal(keyFromRemote("git@github.com:RielJ/web-portfollio.git"), "rielj-web-portfollio");
		assert.equal(keyFromRemote("https://github.com/Tailor/tailor-remix-app"), "tailor-tailor-remix-app");
		assert.equal(keyFromRemote("nonsense"), null);
	});

	it("uses origin, shares the key across worktrees, falls back to the main dir, null outside git", () => {
		const repo = join(tmp(), "My Repo");
		mkdirSync(repo);
		sh(repo, "init", "-q");
		assert.equal(repoKey(repo), "my-repo");
		sh(repo, "-c", "commit.gpgsign=false", "-c", "user.name=t", "-c", "user.email=t@t", "commit", "-q", "--allow-empty", "-m", "x");
		const wt = join(tmp(), "wt");
		sh(repo, "worktree", "add", "-q", wt);
		assert.equal(repoKey(wt), "my-repo");
		sh(repo, "remote", "add", "origin", "git@github.com:Owner/Thing.git");
		assert.equal(repoKey(wt), "owner-thing");
		assert.equal(repoKey(tmp("nogit-")), null);
	});
});

describe("store", () => {
	it("creates the layout with a local, unsigned git repo and a global core stub", () => {
		const root = tmp();
		ensureLayout(root);
		for (const p of ["global/notes", "repos", "inbox", "log.md", "index.md", ".gitignore", "global/core.md"]) {
			assert.ok(existsSync(join(root, p)), p);
		}
		assert.equal(sh(root, "config", "commit.gpgsign"), "false");
		assert.equal(sh(root, "remote"), "");
		assert.equal(readCore(root, "global"), "");
	});

	it("creates a repo core stub once and commits it", () => {
		const root = tmp();
		ensureLayout(root);
		assert.equal(ensureRepoCore(root, "owner-thing"), true);
		assert.equal(ensureRepoCore(root, "owner-thing"), false);
		assert.match(sh(root, "log", "--oneline"), /create core.md for owner-thing/);
	});

	it("enforces the core token cap", () => {
		const root = tmp();
		ensureLayout(root);
		addCoreRule(root, "global", "Use pnpm", "lockfile drift");
		assert.match(readCore(root, "global"), /- Use pnpm — why: lockfile drift/);
		assert.throws(() => addCoreRule(root, "global", "x".repeat(1300), "too long"), /exceed 300 tokens/);
	});

	it("writes, lists, promotes inbox notes and rebuilds the index", () => {
		const root = tmp();
		ensureLayout(root);
		writeNote(root, sample);
		const candidate = { ...sample, id: uniqueId(root, "pnpm only"), source: "compaction" as const };
		assert.equal(candidate.id, "pnpm-only-2");
		writeNote(root, candidate, { inbox: true });
		assert.equal(listNotes(root).length, 1);
		assert.equal(listInbox(root).length, 1);
		rebuildIndex(root);
		const index = readFileSync(join(root, "index.md"), "utf8");
		assert.match(index, /## repo:rielj-web-portfollio/);
		assert.match(index, /\[\[pnpm-only\]\] preference · high · Use pnpm, never npm\./);
		assert.match(index, /Inbox: 1 candidate/);
		promote(root, listInbox(root)[0]);
		assert.equal(listInbox(root).length, 0);
		assert.equal(listNotes(root).length, 2);
		assert.equal(commit(root, "test"), true);
		assert.equal(commit(root, "nothing"), false);
	});
});
