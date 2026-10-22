import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, it } from "node:test";
import { type MemoryUI, runLint, runReview, runSave, statusText } from "../commands.ts";
import { createState, type MemoryState } from "../state.ts";
import { ensureLayout, listInbox, listNotes, readCore, writeNote } from "../store.ts";
import { saveMemory } from "../write.ts";

const states: MemoryState[] = [];
const dirs: string[] = [];
afterEach(() => {
	for (const s of states.splice(0)) s.close();
	for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

function setup(repoKey: string | null = "owner-repo"): MemoryState {
	const root = mkdtempSync(join(tmpdir(), "mem-cmd-"));
	dirs.push(root);
	ensureLayout(root);
	const state = createState(root);
	state.repoKey = repoKey;
	state.scopes = repoKey ? ["global", `repo:${repoKey}`] : ["global"];
	states.push(state);
	return state;
}

/** Scripted UI: answers come off the queue; a function answer can pick from the options. */
function fakeUI(answers: (string | undefined | ((options: string[]) => string | undefined))[]) {
	const prompts: string[] = [];
	const notices: string[] = [];
	const next = (options: string[] = []) => {
		const a = answers.shift();
		return typeof a === "function" ? a(options) : a;
	};
	const ui: MemoryUI = {
		async select(title, options) {
			prompts.push(title);
			return next(options);
		},
		async input(title) {
			prompts.push(title);
			return next();
		},
		notify(message) {
			notices.push(message);
		},
	};
	return { ui, prompts, notices };
}

const queue = (state: MemoryState, summary: string, extra: Record<string, unknown> = {}) =>
	saveMemory(
		{ summary, why: "seen in a session", scope: "repo:owner-repo", requestedBy: "compaction", ...extra },
		{ root: state.root, index: state.index(), tainted: true },
	);

describe("/memory save", () => {
	it("saves a repo note with high confidence", async () => {
		const state = setup();
		const { ui } = fakeUI(["lockfile drift broke CI", "This repo (owner-repo)", "Note (searchable)"]);
		const msg = await runSave(state, ui, "Use pnpm, never npm");
		assert.match(msg, /Saved \[\[use-pnpm-never-npm\]\]/);
		const [note] = listNotes(state.root);
		assert.equal(note.scope, "repo:owner-repo");
		assert.equal(note.confidence, "high");
	});

	it("adds a global core rule, and requires a why", async () => {
		const state = setup();
		assert.match(await runSave(state, fakeUI([""]).ui, "No why"), /a why is required/);
		const { ui } = fakeUI(["user decides", "Global (all repos)", "core.md rule (loaded every session)"]);
		assert.match(await runSave(state, ui, "Never auto-commit"), /Added to global core.md/);
		assert.match(readCore(state.root, "global"), /Never auto-commit — why: user decides/);
	});

	it("skips the scope question outside a repo", async () => {
		const state = setup(null);
		const { ui, prompts } = fakeUI(["because", "Note (searchable)"]);
		await runSave(state, ui, "Prefer fnm for Node");
		assert.ok(!prompts.includes("Save to"));
		assert.equal(listNotes(state.root)[0].scope, "global");
	});
});

describe("/memory review", () => {
	it("approves, confirms, rejects and commits", async () => {
		const state = setup();
		queue(state, "Run tests with vitest");
		queue(state, "Deploy previews on vercel");
		queue(state, "Ignore this junk");
		const { ui } = fakeUI(["Approve", "Approve and confirm (high confidence)", "Reject"]);
		const msg = await runReview(state, ui);
		assert.match(msg, /2 approved, 1 rejected, 0 skipped\. 0 left/);
		const notes = listNotes(state.root);
		assert.deepEqual(notes.map((n) => n.confidence).sort(), ["high", "medium"]);
		assert.equal(listInbox(state.root).length, 0);
		assert.match(execFileSync("git", ["-C", state.root, "log", "-1", "--format=%s"], { encoding: "utf8" }), /review \(2 approved/);
		assert.match(readFileSync(join(state.root, "log.md"), "utf8"), /reject \| ignore-this-junk/);
	});

	it("edits before approving, adds proposed core rules, and stops early", async () => {
		const state = setup();
		queue(state, "Use bun for scripts", { core: true });
		queue(state, "Old summary");
		queue(state, "Left alone");
		const { ui } = fakeUI([
			(options) => {
				assert.ok(options.includes("Add to core.md"));
				return "Add to core.md";
			},
			"Edit, then approve",
			"New summary",
			"",
			"Stop reviewing",
		]);
		const msg = await runReview(state, ui);
		assert.match(msg, /2 approved.*1 left in inbox/);
		assert.match(readCore(state.root, "repo:owner-repo"), /Use bun for scripts/);
		assert.equal(listNotes(state.root)[0].summary, "New summary");
	});

	it("reports an empty inbox", async () => {
		assert.equal(await runReview(setup(), fakeUI([]).ui), "Inbox is empty.");
	});
});

describe("/memory lint", () => {
	it("writes a report, applies chosen actions, and commits", async () => {
		const state = setup();
		writeNote(state.root, {
			id: "weak",
			type: "fact",
			scope: "global",
			summary: "Maybe use tabs",
			why: "",
			confidence: "low",
			source: "agent",
			created: "2026-01-01",
			supersedes: [],
			relates: [],
			body: "",
		});
		const { ui } = fakeUI(["Go through flagged notes", "Delete"]);
		const msg = await runLint(state, ui, new Date("2026-10-15T00:00:00Z"));
		assert.match(msg, /issue\(s\).*1 changed/);
		assert.ok(existsSync(join(state.root, "lint-report.md")));
		assert.equal(listNotes(state.root).length, 0);
	});

	it("says so when there is nothing to fix", async () => {
		assert.match(await runLint(setup(), fakeUI([]).ui), /^Lint: no issues/);
	});
});

describe("/memory status", () => {
	it("summarises scopes, inbox and session taint", () => {
		const state = setup();
		saveMemory({ summary: "A fact", why: "x", scope: "global", requestedBy: "user" }, { root: state.root, index: state.index(), tainted: false });
		queue(state, "Candidate");
		state.taint.observe("web_read", {});
		const text = statusText(state);
		assert.match(text, /Repo: owner-repo/);
		assert.match(text, /Notes: 1 · inbox: 1/);
		assert.match(text, /global: 1 high, 0 medium, 0 low/);
		assert.match(text, /read outside content \(web_read\)/);
	});
});
