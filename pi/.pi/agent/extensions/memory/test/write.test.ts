import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, it } from "node:test";
import { MemoryIndex } from "../search.ts";
import { findSecret } from "../secrets.ts";
import { ensureLayout, listInbox, listNotes, readCore } from "../store.ts";
import { TaintTracker, taints } from "../taint.ts";
import { routeSave, type SaveInput, saveMemory, similarity } from "../write.ts";

const dirs: string[] = [];
const indexes: MemoryIndex[] = [];
afterEach(() => {
	for (const i of indexes.splice(0)) i.close();
	for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

function setup() {
	const root = mkdtempSync(join(tmpdir(), "mem-write-"));
	dirs.push(root);
	ensureLayout(root);
	const index = new MemoryIndex(root);
	indexes.push(index);
	return { root, index };
}

const base: SaveInput = {
	summary: "Use pnpm, never npm, in web-portfollio",
	why: "npm created a second lockfile and broke CI",
	type: "preference",
	scope: "repo:rielj-web-portfollio",
	requestedBy: "agent",
};

describe("secrets", () => {
	it("flags credentials and ignores normal text", () => {
		assert.equal(findSecret("token: ghp_abcdefghijklmnopqrstuvwxyz0123456789"), "GitHub token");
		assert.equal(findSecret("key sk-ant-api03-abcdefghijklmnopqrstuv"), "Anthropic key");
		assert.equal(findSecret("-----BEGIN OPENSSH PRIVATE KEY-----"), "private key");
		assert.equal(findSecret("password = hunter2hunter2"), "assigned secret");
		assert.equal(findSecret("Use the token from 1Password, never hardcode it"), null);
	});
});

describe("taint", () => {
	it("taints on web tools and fetching shell commands only", () => {
		assert.equal(taints("web_read", {}), "web_read");
		assert.equal(taints("agent_browser", {}), "agent_browser");
		assert.equal(taints("bash", { command: "curl -s https://x" }), "bash: curl");
		assert.equal(taints("bash", { command: "gh api repos/x" }), "bash: gh api");
		assert.equal(taints("bash", { command: "pnpm test" }), null);
		assert.equal(taints("read", { path: "README.md" }), null);
		const t = new TaintTracker();
		t.observe("read", {});
		assert.equal(t.tainted, false);
		t.observe("web_search", {});
		t.observe("bash", { command: "curl x" });
		assert.equal(t.reason, "web_search");
		t.reset();
		assert.equal(t.tainted, false);
	});
});

describe("routing", () => {
	it("follows the approval policy", () => {
		const user = { ...base, requestedBy: "user" as const };
		const comp = { ...base, requestedBy: "compaction" as const };
		assert.equal(routeSave(base, false), "direct");
		assert.equal(routeSave(base, true), "inbox");
		assert.equal(routeSave(user, true, "please remember this"), "direct");
		assert.equal(routeSave(user, true, "ok continue"), "inbox");
		assert.equal(routeSave(comp, false), "inbox");
	});

	it("scores summary overlap", () => {
		assert.ok(similarity("Use pnpm never npm", "Always use pnpm, never npm") >= 0.75);
		assert.ok(similarity("Use pnpm never npm", "Deploy with vercel") < 0.2);
	});
});

describe("saveMemory", () => {
	it("saves agent notes directly in a clean session with medium confidence and commits", () => {
		const { root, index } = setup();
		const r = saveMemory(base, { root, index, tainted: false, now: new Date("2026-10-15T00:00:00Z") });
		assert.equal(r.status, "saved");
		const [note] = listNotes(root);
		assert.equal(note.confidence, "medium");
		assert.equal(note.source, "agent");
		assert.equal(note.review_after, "2027-01-13");
		assert.match(execFileSync("git", ["-C", root, "log", "--oneline"], { encoding: "utf8" }), /memory: save /);
	});

	it("gives user saves high confidence and a confirmed date", () => {
		const { root, index } = setup();
		saveMemory({ ...base, requestedBy: "user" }, { root, index, tainted: false });
		const [note] = listNotes(root);
		assert.equal(note.confidence, "high");
		assert.ok(note.confirmed);
	});

	it("queues agent saves from tainted sessions", () => {
		const { root, index } = setup();
		const r = saveMemory(base, { root, index, tainted: true });
		assert.equal(r.status, "inbox");
		assert.equal(listNotes(root).length, 0);
		assert.equal(listInbox(root).length, 1);
	});

	it("rejects missing why and secrets", () => {
		const { root, index } = setup();
		assert.equal(saveMemory({ ...base, why: " " }, { root, index, tainted: false }).status, "rejected");
		const r = saveMemory({ ...base, body: "api_key=abcd1234efgh5678" }, { root, index, tainted: false }); // gitleaks:allow (fake key fixture)
		assert.equal(r.status, "rejected");
		assert.equal(listNotes(root).length, 0);
	});

	it("blocks duplicates unless superseding them", () => {
		const { root, index } = setup();
		saveMemory(base, { root, index, tainted: false });
		const dup = saveMemory({ ...base, summary: "Always use pnpm, never npm in web-portfollio" }, { root, index, tainted: false });
		assert.equal(dup.status, "duplicate");
		const replace = saveMemory(
			{ ...base, summary: "Always use pnpm, never npm in web-portfollio", supersedes: [dup.id as string] },
			{ root, index, tainted: false },
		);
		assert.equal(replace.status, "saved");
		assert.equal(listNotes(root).length, 2);
	});

	it("adds core rules directly and respects the cap", () => {
		const { root, index } = setup();
		const r = saveMemory({ ...base, scope: "global", core: true }, { root, index, tainted: false });
		assert.equal(r.status, "core");
		assert.match(readCore(root, "global"), /Use pnpm, never npm/);
		assert.throws(() => saveMemory({ ...base, scope: "global", core: true, summary: "x ".repeat(700) }, { root, index, tainted: false }), /exceed/);
	});
});
