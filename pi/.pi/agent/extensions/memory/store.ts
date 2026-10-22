/**
 * Memory store: plain Markdown notes under ~/.pi/memory (local only).
 *
 * Layout:
 *   index.md, log.md             generated catalog, append-only log
 *   global/core.md, global/notes/<id>.md
 *   repos/<key>/core.md, repos/<key>/notes/<id>.md
 *   inbox/<stamp>-<id>.md        candidates awaiting /memory review
 *
 * No runtime dependencies on Pi, so tests run under plain `node --test`.
 */
import { execFileSync } from "node:child_process";
import {
	appendFileSync,
	existsSync,
	mkdirSync,
	readdirSync,
	readFileSync,
	renameSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { homedir } from "node:os";
import { basename, dirname, join } from "node:path";

export const NOTE_TYPES = ["preference", "decision", "fact", "gotcha", "procedure"] as const;
export type NoteType = (typeof NOTE_TYPES)[number];
export const CONFIDENCES = ["high", "medium", "low"] as const;
export type Confidence = (typeof CONFIDENCES)[number];
export type Source = "user" | "agent" | "compaction";

/** "global" or "repo:<key>" */
export type Scope = string;

export interface Note {
	id: string;
	type: NoteType;
	scope: Scope;
	summary: string;
	why: string;
	confidence: Confidence;
	source: Source;
	created: string;
	confirmed?: string;
	review_after?: string;
	supersedes: string[];
	relates: string[];
	body: string;
	/** Absolute path, set when read from disk. */
	path?: string;
	/** True when the note lives in inbox/. */
	inbox?: boolean;
}

/** Rough token estimate used for every budget in this extension. */
export function estimateTokens(text: string): number {
	return Math.ceil(text.length / 4);
}

export const CORE_TOKEN_CAP = 300;

export function memoryRoot(): string {
	return process.env.PI_MEMORY_DIR || join(homedir(), ".pi", "memory");
}

export function today(now = new Date()): string {
	return now.toISOString().slice(0, 10);
}

export function addDays(date: string, days: number): string {
	const d = new Date(`${date}T00:00:00Z`);
	d.setUTCDate(d.getUTCDate() + days);
	return today(d);
}

export function slugify(text: string): string {
	const slug = text
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-+|-+$/g, "")
		.slice(0, 48)
		.replace(/-+$/g, "");
	return slug || "note";
}

// ── Frontmatter ─────────────────────────────────────────────────────

function parseLinks(value: string): string[] {
	const links = [...value.matchAll(/\[\[([^\]]+)\]\]/g)].map((m) => m[1].trim());
	if (links.length) return links;
	const inner = value.replace(/^\[|\]$/g, "").trim();
	return inner ? inner.split(",").map((s) => s.trim()).filter(Boolean) : [];
}

function unquote(value: string): string {
	const v = value.trim();
	if (v.startsWith('"') && v.endsWith('"')) {
		try {
			return JSON.parse(v) as string;
		} catch {
			return v.slice(1, -1);
		}
	}
	if (v.startsWith("'") && v.endsWith("'")) return v.slice(1, -1).replace(/''/g, "'");
	return v;
}

/** Strip inline comments only outside a quoted frontmatter scalar. */
function stripComment(value: string): string {
	const v = value.trimStart();
	let quote = v[0] === '"' || v[0] === "'" ? v[0] : null;
	for (let i = quote ? 1 : 0; i < v.length; i++) {
		const ch = v[i];
		if (quote) {
			if (quote === '"' && ch === "\\") i++;
			else if (quote === "'" && ch === "'" && v[i + 1] === "'") i++;
			else if (ch === quote) quote = null;
		} else if (ch === "#" && (i === 0 || /\s/.test(v[i - 1]))) {
			return v.slice(0, i).trimEnd();
		}
	}
	return v;
}

/** Split `---` frontmatter from a Markdown body. Missing frontmatter yields {}. */
export function splitFrontmatter(text: string): { fields: Record<string, string>; body: string } {
	const match = text.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
	if (!match) return { fields: {}, body: text };
	const fields: Record<string, string> = {};
	for (const line of match[1].split("\n")) {
		const kv = line.match(/^([a-z_]+):\s*(.*)$/);
		if (!kv) continue;
		fields[kv[1]] = stripComment(kv[2]);
	}
	return { fields, body: match[2] };
}

export function parseNote(text: string, path?: string): Note {
	const { fields, body } = splitFrontmatter(text);
	const pick = <T extends string>(value: string | undefined, allowed: readonly T[], fallback: T): T =>
		allowed.includes(value as T) ? (value as T) : fallback;
	const note: Note = {
		id: unquote(fields.id ?? (path ? basename(path, ".md").replace(/^\d{8}-\d{4,9}-/, "") : "")),
		type: pick(unquote(fields.type ?? ""), NOTE_TYPES, "fact"),
		scope: unquote(fields.scope ?? "global") || "global",
		summary: unquote(fields.summary ?? ""),
		why: unquote(fields.why ?? ""),
		confidence: pick(unquote(fields.confidence ?? ""), CONFIDENCES, "medium"),
		source: pick(unquote(fields.source ?? ""), ["user", "agent", "compaction"] as const, "agent"),
		created: unquote(fields.created ?? ""),
		supersedes: parseLinks(fields.supersedes ?? ""),
		relates: parseLinks(fields.relates ?? ""),
		body: body.trim(),
	};
	if (fields.confirmed) note.confirmed = unquote(fields.confirmed);
	if (fields.review_after) note.review_after = unquote(fields.review_after);
	if (path) note.path = path;
	return note;
}

function quoteIfNeeded(value: string): string {
	const oneLine = value.replace(/\s*\n\s*/g, " ").trim();
	return /[:#]|^[[\]'"]/.test(oneLine) ? JSON.stringify(oneLine) : oneLine;
}

export function serializeNote(note: Note): string {
	const links = (ids: string[]) => (ids.length ? ids.map((id) => `[[${id}]]`).join(", ") : "[]");
	const lines = [
		"---",
		`id: ${note.id}`,
		`type: ${note.type}`,
		`scope: ${note.scope}`,
		`summary: ${quoteIfNeeded(note.summary)}`,
		`why: ${quoteIfNeeded(note.why)}`,
		`confidence: ${note.confidence}`,
		`source: ${note.source}`,
		`created: ${note.created}`,
	];
	if (note.confirmed) lines.push(`confirmed: ${note.confirmed}`);
	if (note.review_after) lines.push(`review_after: ${note.review_after}`);
	lines.push(`supersedes: ${links(note.supersedes)}`, `relates: ${links(note.relates)}`, "---");
	const body = note.body.trim();
	return `${lines.join("\n")}\n${body ? `${body}\n` : ""}`;
}

// ── Layout and scopes ───────────────────────────────────────────────

export function scopeDir(root: string, scope: Scope): string {
	if (scope === "global") return join(root, "global");
	if (scope.startsWith("repo:")) return join(root, "repos", scope.slice(5));
	throw new Error(`Invalid scope "${scope}". Use "global" or "repo:<key>".`);
}

export function corePath(root: string, scope: Scope): string {
	return join(scopeDir(root, scope), "core.md");
}

function git(root: string, args: string[]): string {
	return execFileSync("git", ["-C", root, ...args], {
		encoding: "utf8",
		stdio: ["ignore", "pipe", "pipe"],
		timeout: 10_000,
	}).trim();
}

/** Create the store layout and its local git repo (no remote, unsigned commits). */
export function ensureLayout(root = memoryRoot()): void {
	for (const dir of ["global/notes", "repos", "inbox"]) mkdirSync(join(root, dir), { recursive: true });
	const gitignore = join(root, ".gitignore");
	if (!existsSync(gitignore)) writeFileSync(gitignore, ".index.sqlite*\n.stats.json\n");
	const globalCore = corePath(root, "global");
	if (!existsSync(globalCore)) writeFileSync(globalCore, coreStub("global"));
	if (!existsSync(join(root, "log.md"))) writeFileSync(join(root, "log.md"), "# Memory log\n\n");
	if (!existsSync(join(root, ".git"))) {
		try {
			git(root, ["init", "-q"]);
			// Local-only store: never signed, never pushed.
			git(root, ["config", "commit.gpgsign", "false"]);
			git(root, ["config", "user.name", "pi-memory"]);
			git(root, ["config", "user.email", "pi-memory@localhost"]);
		} catch {
			// git missing: the store still works without history.
		}
	}
	if (!existsSync(join(root, "index.md"))) rebuildIndex(root);
}

export function coreStub(scope: Scope): string {
	return [
		"---",
		`scope: ${scope}`,
		"---",
		"<!-- One rule per line: `- <rule> — why: <reason>`. Kept under 300 tokens; injected at session start. -->",
		"",
	].join("\n");
}

/** Create repos/<key>/core.md if missing. Returns true when it was created. */
export function ensureRepoCore(root: string, key: string): boolean {
	const scope = `repo:${key}`;
	mkdirSync(join(scopeDir(root, scope), "notes"), { recursive: true });
	const path = corePath(root, scope);
	if (existsSync(path)) return false;
	writeFileSync(path, coreStub(scope));
	appendLog(root, "stub", key);
	commit(root, `memory: create core.md for ${key}`);
	return true;
}

/** Core rules for a scope, without frontmatter or comments. Empty when none. */
export function readCore(root: string, scope: Scope): string {
	const path = corePath(root, scope);
	if (!existsSync(path)) return "";
	const { body } = splitFrontmatter(readFileSync(path, "utf8"));
	return body
		.replace(/<!--[\s\S]*?-->/g, "")
		.split("\n")
		.filter((line) => line.trim())
		.join("\n")
		.trim();
}

/** Append one rule to a scope's core.md, enforcing the token cap. */
export function addCoreRule(root: string, scope: Scope, rule: string, why: string): void {
	const path = corePath(root, scope);
	mkdirSync(dirname(path), { recursive: true });
	if (!existsSync(path)) writeFileSync(path, coreStub(scope));
	const line = `- ${rule.trim()} — why: ${why.trim()}`;
	const next = `${readCore(root, scope)}\n${line}`.trim();
	if (estimateTokens(next) > CORE_TOKEN_CAP) {
		throw new Error(
			`core.md for ${scope} would exceed ${CORE_TOKEN_CAP} tokens. Merge or remove a rule first, or save this as a note.`,
		);
	}
	appendFileSync(path, `${line}\n`);
}

// ── Repo key ────────────────────────────────────────────────────────

/** Turn a git remote URL into "owner-repo" (lowercase). */
export function keyFromRemote(url: string): string | null {
	const cleaned = url.trim().replace(/\.git$/, "").replace(/\/+$/, "");
	const match = cleaned.match(/[:/]([^/:]+)\/([^/:]+)$/);
	if (!match) return null;
	return slugify(`${match[1]}-${match[2]}`);
}

/**
 * Stable key for the repo containing `cwd`, shared by all of its worktrees:
 * the origin remote, else the main worktree's directory name. Null outside git.
 */
export function repoKey(cwd: string): string | null {
	const run = (args: string[]) =>
		execFileSync("git", ["-C", cwd, ...args], {
			encoding: "utf8",
			stdio: ["ignore", "pipe", "ignore"],
			timeout: 5_000,
		}).trim();
	try {
		run(["rev-parse", "--git-dir"]);
	} catch {
		return null;
	}
	try {
		const key = keyFromRemote(run(["remote", "get-url", "origin"]));
		if (key) return key;
	} catch {
		// no origin remote
	}
	try {
		const common = run(["rev-parse", "--path-format=absolute", "--git-common-dir"]);
		const main = basename(common) === ".git" ? dirname(common) : common.replace(/\.git$/, "");
		return slugify(basename(main));
	} catch {
		return null;
	}
}

// ── Notes ───────────────────────────────────────────────────────────

function noteFiles(dir: string): string[] {
	if (!existsSync(dir)) return [];
	return readdirSync(dir)
		.filter((f) => f.endsWith(".md"))
		.map((f) => join(dir, f));
}

/** All committed notes (not core.md), plus inbox candidates when asked. */
export function listNotes(root = memoryRoot(), opts: { inbox?: boolean } = {}): Note[] {
	const files = [...noteFiles(join(root, "global", "notes"))];
	const reposDir = join(root, "repos");
	if (existsSync(reposDir)) {
		for (const key of readdirSync(reposDir)) files.push(...noteFiles(join(reposDir, key, "notes")));
	}
	const notes = files.map((f) => parseNote(readFileSync(f, "utf8"), f));
	if (opts.inbox) {
		for (const f of noteFiles(join(root, "inbox"))) {
			notes.push({ ...parseNote(readFileSync(f, "utf8"), f), inbox: true });
		}
	}
	return notes;
}

export function listInbox(root = memoryRoot()): Note[] {
	return noteFiles(join(root, "inbox"))
		.sort()
		.map((f) => ({ ...parseNote(readFileSync(f, "utf8"), f), inbox: true }));
}

export function findNote(root: string, id: string): Note | undefined {
	return listNotes(root, { inbox: true }).find((n) => n.id === id);
}

export function uniqueId(root: string, base: string): string {
	const taken = new Set(listNotes(root, { inbox: true }).map((n) => n.id));
	let id = slugify(base);
	for (let i = 2; taken.has(id); i++) id = `${slugify(base)}-${i}`;
	return id;
}

let lastStampMs = 0;

/** Inbox file prefix, YYYYMMDD-HHMMSSmmm. Strictly increasing, so file names sort in arrival order. */
function stamp(now = new Date()): string {
	const ms = Math.max(now.getTime(), lastStampMs + 1);
	lastStampMs = ms;
	return new Date(ms).toISOString().slice(0, 23).replace(/[-:.]/g, "").replace("T", "-");
}

/** Write a note to its scope (or inbox/) and return the path. */
export function writeNote(root: string, note: Note, opts: { inbox?: boolean } = {}): string {
	const dir = opts.inbox ? join(root, "inbox") : join(scopeDir(root, note.scope), "notes");
	mkdirSync(dir, { recursive: true });
	const fileName = opts.inbox ? `${stamp()}-${note.id}.md` : `${note.id}.md`;
	const keepPath = note.path && !opts.inbox && !note.inbox;
	const path = keepPath ? (note.path as string) : join(dir, fileName);
	writeFileSync(path, serializeNote(note));
	return path;
}

/** Move an inbox candidate into its scope. */
export function promote(root: string, note: Note): string {
	if (!note.path) throw new Error(`Note ${note.id} has no path`);
	const target = join(scopeDir(root, note.scope), "notes", `${note.id}.md`);
	mkdirSync(dirname(target), { recursive: true });
	writeFileSync(target, serializeNote({ ...note, inbox: false, path: undefined }));
	if (note.path !== target) rmSync(note.path, { force: true });
	return target;
}

export function removeNote(note: Note): void {
	if (note.path) rmSync(note.path, { force: true });
}

export function moveFile(from: string, to: string): void {
	mkdirSync(dirname(to), { recursive: true });
	renameSync(from, to);
}

// ── Index, log, history ─────────────────────────────────────────────

export function rebuildIndex(root = memoryRoot()): void {
	const notes = listNotes(root);
	const byScope = new Map<string, Note[]>();
	for (const note of notes) {
		const list = byScope.get(note.scope) ?? [];
		list.push(note);
		byScope.set(note.scope, list);
	}
	const superseded = new Set(notes.flatMap((n) => n.supersedes));
	const lines = ["# Memory index", "", "Generated. One line per note: [[id]] type · confidence · summary.", ""];
	const rank = (scope: string) => (scope === "global" ? `0${scope}` : `1${scope}`);
	const scopes = [...byScope.keys()].sort((a, b) => rank(a).localeCompare(rank(b)));
	for (const scope of scopes) {
		lines.push(`## ${scope}`, "");
		const inScope = [...(byScope.get(scope) ?? [])].sort((a, b) => a.id.localeCompare(b.id));
		for (const n of inScope) {
			const flag = superseded.has(n.id) ? " (superseded)" : "";
			lines.push(`- [[${n.id}]] ${n.type} · ${n.confidence} · ${n.summary}${flag}`);
		}
		lines.push("");
	}
	const inbox = listInbox(root).length;
	if (inbox) lines.push(`Inbox: ${inbox} candidate(s) awaiting /memory review.`, "");
	writeFileSync(join(root, "index.md"), lines.join("\n"));
}

export function appendLog(root: string, action: string, id: string, detail = ""): void {
	const line = `## [${today()}] ${action} | ${id}${detail ? ` | ${detail.replace(/\n/g, " ")}` : ""}\n`;
	appendFileSync(join(root, "log.md"), line);
}

/** Commit every change in the local store. Never fails the caller. */
export function commit(root: string, message: string): boolean {
	try {
		if (!existsSync(join(root, ".git"))) return false;
		git(root, ["add", "-A"]);
		if (!git(root, ["status", "--porcelain"])) return false;
		git(root, ["commit", "-q", "--no-verify", "-m", message]);
		return true;
	} catch {
		return false;
	}
}
