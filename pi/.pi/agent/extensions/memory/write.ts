/**
 * Save path shared by the memory_write tool, /memory save and inbox approval.
 * Decides direct vs inbox, scans for secrets, catches duplicates, and keeps
 * index.md, log.md and the local git history in step.
 */
import type { MemoryIndex } from "./search.ts";
import { findSecret } from "./secrets.ts";
import {
	addCoreRule,
	addDays,
	appendLog,
	commit,
	type Note,
	NOTE_TYPES,
	type NoteType,
	rebuildIndex,
	type Scope,
	today,
	uniqueId,
	writeNote,
} from "./store.ts";

export interface SaveInput {
	summary: string;
	why: string;
	type?: NoteType;
	scope: Scope;
	body?: string;
	relates?: string[];
	supersedes?: string[];
	/** Add as a one-line rule to the scope's core.md instead of a note. */
	core?: boolean;
	requestedBy: "user" | "agent" | "compaction";
}

export interface SaveContext {
	root: string;
	index: MemoryIndex;
	tainted: boolean;
	/** Latest user message, used to confirm "remember this" in tainted sessions. */
	lastUserText?: string;
	now?: Date;
}

export type SaveStatus = "saved" | "core" | "inbox" | "duplicate" | "rejected";

export interface SaveResult {
	status: SaveStatus;
	id?: string;
	message: string;
}

const ASKED_TO_REMEMBER = /\b(remember|memori[sz]e|save (this|that|it)|note (this|that)|don'?t forget)\b/i;

/** Word-set overlap between two summaries, 0..1. */
export function similarity(a: string, b: string): number {
	const words = (s: string) => new Set(s.toLowerCase().match(/[a-z0-9]{3,}/g) ?? []);
	const wa = words(a);
	const wb = words(b);
	if (!wa.size || !wb.size) return 0;
	let shared = 0;
	for (const w of wa) if (wb.has(w)) shared++;
	return shared / Math.min(wa.size, wb.size);
}

export function routeSave(input: SaveInput, tainted: boolean, lastUserText = ""): "direct" | "inbox" {
	if (input.requestedBy === "compaction") return "inbox";
	if (!tainted) return "direct";
	if (input.requestedBy === "user" && ASKED_TO_REMEMBER.test(lastUserText)) return "direct";
	return "inbox";
}

export function saveMemory(input: SaveInput, ctx: SaveContext): SaveResult {
	const summary = input.summary.trim();
	const why = input.why.trim();
	if (!summary) return { status: "rejected", message: "summary is required." };
	if (!why) return { status: "rejected", message: "why is required: one line on what this prevents or why it was decided." };
	const secret = findSecret(`${summary}\n${why}\n${input.body ?? ""}`);
	if (secret) return { status: "rejected", message: `Refused: the text looks like it contains a ${secret}. Never store credentials.` };

	const route = routeSave(input, ctx.tainted, ctx.lastUserText);
	const date = today(ctx.now);

	if (input.core && route === "direct") {
		addCoreRule(ctx.root, input.scope, summary, why);
		appendLog(ctx.root, "core", input.scope, summary);
		commit(ctx.root, `memory: core rule for ${input.scope}`);
		return { status: "core", message: `Added to ${input.scope} core.md: ${summary}` };
	}

	if (route === "direct") {
		const dup = ctx.index
			.search(summary, { scopes: [input.scope], includeLow: true, expand: false, limit: 3 })
			.find((h) => similarity(h.note.summary, summary) >= 0.75);
		if (dup && !(input.supersedes ?? []).includes(dup.note.id)) {
			return {
				status: "duplicate",
				id: dup.note.id,
				message: `Similar note exists: [[${dup.note.id}]] ${dup.note.summary}. Not saved. To replace it, save again with supersedes: ["${dup.note.id}"].`,
			};
		}
	}

	const fromUser = input.requestedBy === "user";
	const note: Note = {
		id: uniqueId(ctx.root, summary),
		type: NOTE_TYPES.includes(input.type as NoteType) ? (input.type as NoteType) : "fact",
		scope: input.scope,
		summary,
		why,
		confidence: fromUser ? "high" : "medium",
		source: input.requestedBy,
		created: date,
		review_after: addDays(date, fromUser ? 180 : 90),
		supersedes: input.supersedes ?? [],
		relates: input.relates ?? [],
		body: input.body?.trim() ?? "",
	};
	if (fromUser) note.confirmed = date;
	if (input.core) note.body = `${note.body}\n\n(Proposed as a core.md rule.)`.trim();

	const inbox = route === "inbox";
	writeNote(ctx.root, note, { inbox });
	appendLog(ctx.root, inbox ? "inbox" : "save", note.id, summary);
	rebuildIndex(ctx.root);
	commit(ctx.root, `memory: ${inbox ? "inbox" : "save"} ${note.id}`);
	return inbox
		? {
				status: "inbox",
				id: note.id,
				message: `Queued [[${note.id}]] in inbox/ for /memory review${ctx.tainted ? " (this session read outside content)" : ""}.`,
			}
		: { status: "saved", id: note.id, message: `Saved [[${note.id}]] (${input.scope}, ${note.confidence}).` };
}
