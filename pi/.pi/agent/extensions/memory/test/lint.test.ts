import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, it } from "node:test";
import { applyLintAction, decayOverdue, formatReport, type LintIssue, lintStore } from "../lint.ts";
import type { StatsFile } from "../stats.ts";
import { corePath, ensureLayout, ensureRepoCore, listNotes, type Note, writeNote } from "../store.ts";

const NOW = new Date("2026-10-15T12:00:00Z");
const noStats: StatsFile = { notes: {}, injected: {} };

const dirs: string[] = [];
afterEach(() => {
	for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

function setup(): string {
	const root = mkdtempSync(join(tmpdir(), "mem-lint-"));
	dirs.push(root);
	ensureLayout(root);
	return root;
}

/** A healthy note that triggers no rule on NOW. */
function note(id: string, over: Partial<Note> = {}): Note {
	return {
		id,
		type: "fact",
		scope: "global",
		summary: `Summary for ${id}`,
		why: "prevents a known mistake",
		confidence: "high",
		source: "user",
		created: "2026-10-01",
		confirmed: "2026-10-01",
		review_after: "2027-03-30",
		supersedes: [],
		relates: [],
		body: "",
		...over,
	};
}

function seed(root: string, ...notes: Note[]): void {
	for (const n of notes) writeNote(root, n);
}

const kinds = (issues: LintIssue[]) => issues.map((i) => i.kind);
const lint = (root: string, stats = noStats) => lintStore(root, { now: NOW, stats });
const logText = (root: string) => readFileSync(join(root, "log.md"), "utf8");

describe("lintStore rules", () => {
	it("reports nothing on a healthy store", () => {
		const root = setup();
		seed(root, note("alpha-pnpm", { summary: "Use pnpm in web" }), note("beta-deploy", { summary: "Deploy with vercel" }));
		assert.deepEqual(lint(root), []);
	});

	it("flags missing why", () => {
		const root = setup();
		seed(root, note("no-why", { why: "" }), note("has-why", { summary: "Unrelated deploy topic" }));
		const issues = lint(root);
		assert.deepEqual(kinds(issues), ["missing-why"]);
		assert.equal(issues[0].noteId, "no-why");
	});

	it("flags low confidence", () => {
		const root = setup();
		seed(root, note("weak", { confidence: "low" }));
		const issues = lint(root);
		assert.deepEqual(kinds(issues), ["low-confidence"]);
		assert.equal(issues[0].noteId, "weak");
	});

	it("flags old medium notes with no recent use", () => {
		const root = setup();
		seed(
			root,
			note("never-used", { confidence: "medium", created: "2026-01-01", summary: "Alpha topic one" }),
			note("used-long-ago", { confidence: "medium", created: "2026-01-01", summary: "Beta topic two" }),
			note("used-recently", { confidence: "medium", created: "2026-01-01", summary: "Gamma topic three" }),
			note("new-medium", { confidence: "medium", created: "2026-10-01", summary: "Delta topic four" }),
			note("old-high", { confidence: "high", created: "2026-01-01", summary: "Epsilon topic five" }),
		);
		const stats: StatsFile = {
			notes: {
				"used-long-ago": { searched: 3, read: 1, last: "2026-06-01" },
				"used-recently": { searched: 1, read: 0, last: "2026-10-10" },
			},
			injected: {},
		};
		const issues = lint(root, stats);
		assert.deepEqual(kinds(issues), ["unused", "unused"]);
		assert.deepEqual(issues.map((i) => i.noteId), ["never-used", "used-long-ago"]);
		const shorter = lintStore(root, { now: NOW, stats, unusedDays: 365 });
		assert.deepEqual(shorter, []);
	});

	it("flags notes past review_after that were not confirmed since", () => {
		const root = setup();
		seed(
			root,
			note("overdue", { review_after: "2026-10-01", confirmed: "2026-04-01", summary: "Alpha topic one" }),
			note("overdue-never", { review_after: "2026-10-01", confirmed: undefined, summary: "Beta topic two" }),
			note("reconfirmed", { review_after: "2026-10-01", confirmed: "2026-10-05", summary: "Gamma topic three" }),
			note("due-today", { review_after: "2026-10-15", summary: "Delta topic four" }),
			note("no-review", { review_after: undefined, summary: "Epsilon topic five" }),
		);
		const issues = lint(root);
		assert.deepEqual(kinds(issues), ["review-due", "review-due"]);
		assert.deepEqual(issues.map((i) => i.noteId), ["overdue", "overdue-never"]);
	});

	it("flags similar notes in one scope once, unless one supersedes the other", () => {
		const root = setup();
		seed(
			root,
			note("pnpm-a", { summary: "Use pnpm never npm in web" }),
			note("pnpm-b", { summary: "Always use pnpm, never npm" }),
			note("pnpm-other-scope", { scope: "repo:o-r", summary: "Use pnpm never npm in web" }),
			note("old-yarn", { summary: "Use yarn never npm" }),
			note("new-yarn", { summary: "Use yarn, never npm anywhere", supersedes: ["old-yarn"] }),
		);
		const issues = lint(root).filter((i) => i.kind === "contradiction");
		// pnpm-a/pnpm-b; old-yarn is superseded so it drops out; new-yarn still overlaps pnpm notes.
		const pairs = issues.map((i) => [i.noteId, i.otherId].sort().join("+")).sort();
		assert.deepEqual(pairs, ["new-yarn+pnpm-a", "new-yarn+pnpm-b", "pnpm-a+pnpm-b"]);
		assert.ok(issues.every((i) => i.scope === "global"));
	});

	it("skips pairs where either note supersedes the other", () => {
		const root = setup();
		seed(
			root,
			note("first", { summary: "Use pnpm never npm" }),
			note("second", { summary: "Use pnpm never npm please", relates: ["first"] }),
		);
		assert.deepEqual(kinds(lint(root)), ["contradiction"]);
		seed(root, note("second", { summary: "Use pnpm never npm please", supersedes: ["first"] }));
		assert.deepEqual(lint(root), []);
	});

	it("flags links to missing notes", () => {
		const root = setup();
		seed(root, note("linker", { supersedes: ["gone"], relates: ["ghost", "real"] }), note("real", { summary: "Other unrelated deploy" }));
		const issues = lint(root);
		assert.deepEqual(kinds(issues), ["orphan-link", "orphan-link"]);
		assert.deepEqual(issues.map((i) => i.otherId), ["gone", "ghost"]);
		assert.ok(issues.every((i) => i.noteId === "linker"));
	});

	it("flags core.md over the cap for global and repo scopes", () => {
		const root = setup();
		ensureRepoCore(root, "owner-small");
		ensureRepoCore(root, "owner-big");
		assert.deepEqual(lint(root), []);
		writeFileSync(corePath(root, "repo:owner-big"), `---\nscope: repo:owner-big\n---\n- ${"x".repeat(1300)}\n`);
		writeFileSync(corePath(root, "global"), `---\nscope: global\n---\n- ${"y".repeat(1300)}\n`);
		const issues = lint(root);
		assert.deepEqual(kinds(issues), ["core-over-cap", "core-over-cap"]);
		assert.deepEqual(issues.map((i) => i.scope), ["global", "repo:owner-big"]);
	});

	it("summarizes pending inbox candidates in one issue", () => {
		const root = setup();
		writeNote(root, note("cand-1"), { inbox: true });
		writeNote(root, note("cand-2", { summary: "Another candidate" }), { inbox: true });
		const issues = lint(root);
		assert.deepEqual(kinds(issues), ["inbox-pending"]);
		assert.match(issues[0].message, /^2 candidate/);
	});

	it("sorts issues by kind priority", () => {
		const root = setup();
		writeFileSync(corePath(root, "global"), `---\nscope: global\n---\n- ${"y".repeat(1300)}\n`);
		writeNote(root, note("cand"), { inbox: true });
		seed(
			root,
			note("aa-orphan", { relates: ["missing"], summary: "Alpha one" }),
			note("bb-unused", { confidence: "medium", created: "2026-01-01", summary: "Beta two" }),
			note("cc-low", { confidence: "low", summary: "Gamma three" }),
			note("dd-due", { review_after: "2026-09-01", confirmed: undefined, summary: "Delta four" }),
			note("ee-nowhy", { why: "", summary: "Epsilon five" }),
			note("ff-dup1", { summary: "Use pnpm never npm" }),
			note("gg-dup2", { summary: "Use pnpm never npm ok" }),
		);
		assert.deepEqual(kinds(lint(root)), [
			"core-over-cap",
			"contradiction",
			"missing-why",
			"review-due",
			"low-confidence",
			"unused",
			"orphan-link",
			"inbox-pending",
		]);
	});
});

describe("decayOverdue", () => {
	it("drops overdue notes one level, advances review_after and logs", () => {
		const root = setup();
		seed(
			root,
			note("hi", { review_after: "2026-09-01", confirmed: "2026-03-01", summary: "Alpha one" }),
			note("lo", { confidence: "low", review_after: "2026-09-01", confirmed: undefined, summary: "Beta two" }),
			note("fresh", { summary: "Gamma three" }),
		);
		const changed = decayOverdue(root, NOW).sort();
		assert.deepEqual(changed, ["hi", "lo"]);
		const byId = new Map(listNotes(root).map((n) => [n.id, n]));
		assert.equal(byId.get("hi")?.confidence, "medium");
		assert.equal(byId.get("hi")?.review_after, "2027-01-13");
		assert.equal(byId.get("lo")?.confidence, "low");
		assert.equal(byId.get("fresh")?.confidence, "high");
		assert.equal(listNotes(root).length, 3);
		assert.match(logText(root), /decay \| hi \| high -> medium/);
		assert.match(logText(root), /decay \| lo/);
		// No longer due, so a second pass changes nothing.
		assert.deepEqual(decayOverdue(root, NOW), []);
		assert.equal(lint(root).filter((i) => i.kind === "review-due").length, 0);
	});
});

describe("applyLintAction", () => {
	it("confirm sets high, confirmed today and a 180-day review", () => {
		const root = setup();
		seed(root, note("n", { confidence: "low", confirmed: undefined, review_after: "2026-01-01" }));
		const msg = applyLintAction(root, "n", "confirm", NOW);
		assert.match(msg, /\[\[n\]\]/);
		const [n] = listNotes(root);
		assert.equal(n.confidence, "high");
		assert.equal(n.confirmed, "2026-10-15");
		assert.equal(n.review_after, "2027-04-13");
		assert.match(logText(root), /confirm \| n/);
	});

	it("demote drops one level and stays at low", () => {
		const root = setup();
		seed(root, note("n"));
		applyLintAction(root, "n", "demote", NOW);
		assert.equal(listNotes(root)[0].confidence, "medium");
		applyLintAction(root, "n", "demote", NOW);
		assert.equal(listNotes(root)[0].confidence, "low");
		assert.match(applyLintAction(root, "n", "demote", NOW), /already low/);
		assert.equal(listNotes(root)[0].confidence, "low");
		assert.equal(logText(root).match(/demote \| n/g)?.length, 3);
	});

	it("delete removes the file and logs", () => {
		const root = setup();
		seed(root, note("n"));
		const path = join(root, "global", "notes", "n.md");
		assert.ok(existsSync(path));
		assert.match(applyLintAction(root, "n", "delete", NOW), /Deleted/);
		assert.ok(!existsSync(path));
		assert.equal(listNotes(root).length, 0);
		assert.match(logText(root), /delete \| n/);
	});

	it("keep changes nothing and writes no log line", () => {
		const root = setup();
		seed(root, note("n", { confidence: "medium" }));
		const before = readFileSync(join(root, "global", "notes", "n.md"), "utf8");
		const log = logText(root);
		assert.match(applyLintAction(root, "n", "keep", NOW), /Kept/);
		assert.equal(readFileSync(join(root, "global", "notes", "n.md"), "utf8"), before);
		assert.equal(logText(root), log);
	});

	it("throws for an unknown id", () => {
		const root = setup();
		assert.throws(() => applyLintAction(root, "nope", "confirm", NOW), /nope/);
		assert.throws(() => applyLintAction(root, "nope", "keep", NOW), /nope/);
	});

	it("keeps repo notes in their scope directory", () => {
		const root = setup();
		seed(root, note("r", { scope: "repo:o-r" }));
		applyLintAction(root, "r", "demote", NOW);
		assert.ok(existsSync(join(root, "repos", "o-r", "notes", "r.md")));
		assert.equal(listNotes(root).length, 1);
	});
});

describe("formatReport", () => {
	it("says so when empty", () => {
		assert.equal(formatReport([]), "No issues.");
	});

	it("groups by kind with counts and names each note", () => {
		const report = formatReport([
			{ kind: "missing-why", noteId: "a", message: "[[a]] has no why." },
			{ kind: "core-over-cap", scope: "global", message: "global core.md is ~400 tokens (cap 300)." },
			{ kind: "missing-why", noteId: "b", message: "[[b]] has no why." },
		]);
		assert.match(report, /^# Memory lint: 3 issue\(s\)/);
		assert.match(report, /## Missing why \(2\)\n\n- \[\[a\]\] has no why\.\n- \[\[b\]\] has no why\./);
		assert.match(report, /## core\.md over cap \(1\)/);
		assert.ok(report.indexOf("core.md over cap") < report.indexOf("Missing why"));
	});
});
