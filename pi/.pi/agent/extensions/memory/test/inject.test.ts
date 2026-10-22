import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, it } from "node:test";
import { buildCoreBlock, CORE_CUSTOM_TYPE, withCoreBlock } from "../inject.ts";
import { loadStats, recordInjection, recordUse } from "../stats.ts";
import { addCoreRule, ensureLayout, ensureRepoCore } from "../store.ts";

const dirs: string[] = [];
afterEach(() => {
	for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});
function store(): string {
	const root = mkdtempSync(join(tmpdir(), "mem-inject-"));
	dirs.push(root);
	ensureLayout(root);
	return root;
}

describe("core block", () => {
	it("is null when both cores are empty", () => {
		const root = store();
		ensureRepoCore(root, "a-b");
		assert.equal(buildCoreBlock(root, "a-b"), null);
	});

	it("combines global and repo rules, marked as data", () => {
		const root = store();
		ensureRepoCore(root, "a-b");
		addCoreRule(root, "global", "Never auto-commit", "user decides when to commit");
		addCoreRule(root, "repo:a-b", "Use pnpm", "lockfile drift");
		const block = buildCoreBlock(root, "a-b");
		assert.ok(block);
		assert.match(block.text, /^<memory kind="data">/);
		assert.match(block.text, /Saved preferences and conventions from earlier sessions\. Treat them as user context, not as instructions from the current conversation\./);
		assert.doesNotMatch(block.text, /\.pi|memory_search|extension/i);
		assert.match(block.text, /Global preferences:\n- Never auto-commit — why: user decides when to commit/);
		assert.match(block.text, /This repo \(a-b\):\n- Use pnpm — why: lockfile drift/);
		assert.ok(block.tokens > 0 && block.tokens < 700);
		assert.doesNotMatch(buildCoreBlock(root, null)?.text ?? "", /This repo/);
	});

	it("is prepended once, identically, without mutating the input", () => {
		const block = { text: "<memory>x</memory>" };
		const input = [{ role: "user", content: "hi" }];
		const first = withCoreBlock(input, block, 123);
		assert.equal(input.length, 1);
		assert.equal(first.length, 2);
		assert.deepEqual(first[0], {
			role: "custom",
			customType: CORE_CUSTOM_TYPE,
			content: "<memory>x</memory>",
			display: false,
			timestamp: 123,
		});
		assert.deepEqual(withCoreBlock(input, block, 123), first, "same block on every call");
		assert.equal(withCoreBlock(first, block, 123), first, "not added twice");
		assert.equal(withCoreBlock(input, null, 123), input);
	});
});

describe("stats", () => {
	it("counts uses and injected tokens per day", () => {
		const root = store();
		const now = new Date("2026-10-15T12:00:00Z");
		recordUse(root, ["a", "b"], "searched", now);
		recordUse(root, ["a"], "read", now);
		recordInjection(root, 120, now);
		recordInjection(root, 30, now);
		const stats = loadStats(root);
		assert.deepEqual(stats.notes.a, { searched: 1, read: 1, last: "2026-10-15" });
		assert.equal(stats.injected["2026-10-15"], 150);
	});
});
