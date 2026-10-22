/**
 * Local long-term memory for Pi.
 *
 * Store: ~/.pi/memory (Markdown, local git, never pushed, never inside a repo).
 * - session_start: create the store and this repo's core.md stub, build the core block
 * - context: prepend the core block to every request (not persisted, cache-stable)
 * - tool_call: mark the session tainted once it reads outside content
 * - tools: memory_search (search or read by id), memory_write
 * - /memory save | review | lint | status
 * - session_before_compact: queue candidate memories in inbox/ (fire-and-forget)
 */
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { registerCommands } from "./commands.ts";
import { registerExtraction } from "./extract.ts";
import { buildCoreBlock, withCoreBlock } from "./inject.ts";
import { createState, type MemoryState } from "./state.ts";
import { recordInjection } from "./stats.ts";
import { ensureLayout, ensureRepoCore, memoryRoot, repoKey } from "./store.ts";
import { registerTools } from "./tools.ts";

export default function memoryExtension(pi: ExtensionAPI) {
	let state: MemoryState | null = null;
	const getState = () => state;

	pi.on("session_start", async (_event, ctx) => {
		state?.close();
		state = null;
		try {
			const root = memoryRoot();
			ensureLayout(root);
			const next = createState(root);
			next.repoKey = repoKey(ctx.cwd);
			if (next.repoKey) {
				next.scopes = ["global", `repo:${next.repoKey}`];
				if (ensureRepoCore(root, next.repoKey)) {
					ctx.ui.notify(`Memory: created ~/.pi/memory/repos/${next.repoKey}/core.md for this repo`, "info");
				}
			}
			next.coreBlock = buildCoreBlock(root, next.repoKey);
			if (next.coreBlock) recordInjection(root, next.coreBlock.tokens);
			state = next;
		} catch (error) {
			ctx.ui.notify(`Memory disabled for this session: ${error instanceof Error ? error.message : String(error)}`, "warning");
		}
	});

	pi.on("session_shutdown", async () => {
		state?.close();
		state = null;
	});

	pi.on("before_agent_start", async (event) => {
		if (state) state.lastUserText = event.prompt ?? "";
	});

	pi.on("tool_call", async (event) => {
		state?.taint.observe(event.toolName, event.input);
	});

	pi.on("context", async (event) => {
		if (!state?.coreBlock) return;
		const messages = withCoreBlock(event.messages, state.coreBlock, state.sessionStartedAt);
		if (messages !== event.messages) return { messages };
	});

	registerTools(pi, getState);
	registerCommands(pi, getState);
	registerExtraction(pi, getState);
}
