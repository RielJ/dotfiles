/** Per-session state shared by the tools, commands and handlers. */
import { MemoryIndex } from "./search.ts";
import { memoryRoot, type Scope } from "./store.ts";
import { TaintTracker } from "./taint.ts";

export interface MemoryState {
	root: string;
	/** Key of the repo containing cwd, or null outside git. */
	repoKey: string | null;
	/** Scopes visible in this session: global plus the current repo. */
	scopes: Scope[];
	taint: TaintTracker;
	/** Latest user message text (confirms "remember this" in tainted sessions). */
	lastUserText: string;
	/** Fixed timestamp for the injected core block, so requests stay identical. */
	sessionStartedAt: number;
	/** Built once per session; null when both core files are empty. */
	coreBlock: { text: string; tokens: number } | null;
	index(): MemoryIndex;
	close(): void;
}

export function createState(root = memoryRoot()): MemoryState {
	let index: MemoryIndex | null = null;
	return {
		root,
		repoKey: null,
		scopes: ["global"],
		taint: new TaintTracker(),
		lastUserText: "",
		sessionStartedAt: Date.now(),
		coreBlock: null,
		index() {
			index ??= new MemoryIndex(root);
			return index;
		},
		close() {
			index?.close();
			index = null;
		},
	};
}

/** The scope a new note defaults to: the repo when inside one, else global. */
export function defaultScope(state: MemoryState): Scope {
	return state.repoKey ? `repo:${state.repoKey}` : "global";
}
