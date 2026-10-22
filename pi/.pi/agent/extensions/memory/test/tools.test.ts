import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, it } from "node:test";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { createState, type MemoryState } from "../state.ts";
import { ensureLayout, type Note, writeNote } from "../store.ts";
import { registerTools } from "../tools.ts";

type ToolResult = {
	content: Array<{ type: "text"; text: string }>;
	details: Record<string, unknown>;
};

type RegisteredTool = {
	name: string;
	description?: string;
	promptSnippet?: string;
	promptGuidelines?: string[];
	parameters?: unknown;
	execute: (id: string, params: Record<string, unknown>) => Promise<ToolResult>;
};

const states: MemoryState[] = [];
const dirs: string[] = [];

afterEach(() => {
	for (const state of states.splice(0)) state.close();
	for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

function setup(): { state: MemoryState; tools: RegisteredTool[] } {
	const root = mkdtempSync(join(tmpdir(), "mem-tools-"));
	dirs.push(root);
	ensureLayout(root);
	const note: Note = {
		id: "use-pnpm",
		type: "preference",
		scope: "global",
		summary: "Use pnpm for installs",
		why: "Keeps the lockfile stable",
		confidence: "high",
		source: "user",
		created: "2026-10-17",
		supersedes: [],
		relates: [],
		body: "Run pnpm install from the workspace root.",
	};
	writeNote(root, note);

	const state = createState(root);
	states.push(state);
	const tools: RegisteredTool[] = [];
	const api = {
		registerTool(tool: unknown) {
			tools.push(tool as RegisteredTool);
		},
	} as unknown as ExtensionAPI;
	registerTools(api, () => state);
	return { state, tools };
}

describe("memory tools", () => {
	it("uses one read tool for both search and full-note retrieval", async () => {
		const { tools } = setup();
		assert.deepEqual(
			tools.map((tool) => tool.name),
			["memory_search", "memory_write"],
		);

		const search = tools.find((tool) => tool.name === "memory_search");
		assert.ok(search);
		const searchResult = await search.execute("search", { query: "pnpm" });
		assert.match(searchResult.content[0].text, /\[\[use-pnpm\]\]/);

		const readResult = await search.execute("read", { id: "[[use-pnpm]]" });
		assert.match(readResult.content[0].text, /summary: Use pnpm for installs/);
		assert.match(readResult.content[0].text, /Run pnpm install from the workspace root\./);
		assert.deepEqual(readResult.details, { found: true, id: "use-pnpm" });
	});

	it("requires exactly one read mode and keeps implementation paths out of tool metadata", async () => {
		const { tools } = setup();
		const search = tools.find((tool) => tool.name === "memory_search");
		assert.ok(search);

		for (const params of [{}, { query: "pnpm", id: "use-pnpm" }]) {
			const result = await search.execute("invalid", params);
			assert.match(result.content[0].text, /exactly one of query.*or id/);
			assert.equal(result.details.status, "rejected");
		}

		const metadata = JSON.stringify(
			tools.map(({ name, description, promptSnippet, promptGuidelines, parameters }) => ({
				name,
				description,
				promptSnippet,
				promptGuidelines,
				parameters,
			})),
		);
		assert.doesNotMatch(metadata, /\.pi|memory_get|extension/i);
	});
});
