/**
 * /memory lint: report weak memories, decay overdue confidence, and apply the
 * user's choice per flagged note. Nothing here commits or rebuilds the index;
 * the caller does both after a batch of changes.
 */
import { existsSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { loadStats, type StatsFile } from "./stats.ts";
import {
	addDays,
	appendLog,
	type Confidence,
	CORE_TOKEN_CAP,
	estimateTokens,
	listInbox,
	listNotes,
	type Note,
	readCore,
	removeNote,
	type Scope,
	today,
	writeNote,
} from "./store.ts";
import { similarity } from "./write.ts";

export type LintKind =
	| "missing-why"
	| "low-confidence"
	| "unused"
	| "review-due"
	| "contradiction"
	| "orphan-link"
	| "core-over-cap"
	| "inbox-pending";

export interface LintIssue {
	kind: LintKind;
	noteId?: string;
	otherId?: string;
	scope?: string;
	message: string;
}

export type LintAction = "confirm" | "demote" | "delete" | "keep";

/** Report order: most urgent first. */
const ORDER: LintKind[] = [
	"core-over-cap",
	"contradiction",
	"missing-why",
	"review-due",
	"low-confidence",
	"unused",
	"orphan-link",
	"inbox-pending",
];

const LABELS: Record<LintKind, string> = {
	"core-over-cap": "core.md over cap",
	contradiction: "Possible contradictions",
	"missing-why": "Missing why",
	"review-due": "Past review_after",
	"low-confidence": "Low confidence",
	unused: "Unused",
	"orphan-link": "Broken links",
	"inbox-pending": "Inbox",
};

const CONTRADICTION_THRESHOLD = 0.5;
const DECAY_DAYS = 90;
const CONFIRM_DAYS = 180;

function demoted(confidence: Confidence): Confidence {
	return confidence === "high" ? "medium" : "low";
}

function isReviewDue(note: Note, date: string): boolean {
	if (!note.review_after || note.review_after >= date) return false;
	return !note.confirmed || note.confirmed < note.review_after;
}

function coreScopes(root: string): Scope[] {
	const scopes: Scope[] = ["global"];
	const reposDir = join(root, "repos");
	if (existsSync(reposDir)) {
		for (const key of readdirSync(reposDir).sort()) {
			if (statSync(join(reposDir, key)).isDirectory()) scopes.push(`repo:${key}`);
		}
	}
	return scopes;
}

export function lintStore(
	root: string,
	opts: { now?: Date; stats?: StatsFile; unusedDays?: number } = {},
): LintIssue[] {
	const date = today(opts.now);
	const stats = opts.stats ?? loadStats(root);
	const unusedDays = opts.unusedDays ?? 60;
	const cutoff = addDays(date, -unusedDays);
	const notes = listNotes(root).sort((a, b) => a.id.localeCompare(b.id));
	const ids = new Set(notes.map((n) => n.id));
	const superseded = new Set(notes.flatMap((n) => n.supersedes));
	const issues: LintIssue[] = [];

	for (const scope of coreScopes(root)) {
		const tokens = estimateTokens(readCore(root, scope));
		if (tokens > CORE_TOKEN_CAP) {
			issues.push({
				kind: "core-over-cap",
				scope,
				message: `${scope} core.md is ~${tokens} tokens (cap ${CORE_TOKEN_CAP}). Merge or move rules into notes.`,
			});
		}
	}

	const live = notes.filter((n) => !superseded.has(n.id));
	for (let i = 0; i < live.length; i++) {
		for (let j = i + 1; j < live.length; j++) {
			const a = live[i];
			const b = live[j];
			if (a.scope !== b.scope) continue;
			if (a.supersedes.includes(b.id) || b.supersedes.includes(a.id)) continue;
			if (similarity(a.summary, b.summary) < CONTRADICTION_THRESHOLD) continue;
			issues.push({
				kind: "contradiction",
				noteId: a.id,
				otherId: b.id,
				scope: a.scope,
				message: `[[${a.id}]] and [[${b.id}]] have similar summaries in ${a.scope} and neither supersedes the other.`,
			});
		}
	}

	for (const note of notes) {
		if (!note.why.trim()) {
			issues.push({ kind: "missing-why", noteId: note.id, scope: note.scope, message: `[[${note.id}]] has no why.` });
		}
		if (isReviewDue(note, date)) {
			issues.push({
				kind: "review-due",
				noteId: note.id,
				scope: note.scope,
				message: `[[${note.id}]] passed review_after ${note.review_after} without confirmation.`,
			});
		}
		if (note.confidence === "low") {
			issues.push({ kind: "low-confidence", noteId: note.id, scope: note.scope, message: `[[${note.id}]] is low confidence.` });
		}
		if (note.confidence === "medium" && note.created && note.created < cutoff) {
			const last = stats.notes[note.id]?.last;
			if (!last || last < cutoff) {
				issues.push({
					kind: "unused",
					noteId: note.id,
					scope: note.scope,
					message: `[[${note.id}]] ${last ? `last used ${last}` : "never searched or read"} (over ${unusedDays} days).`,
				});
			}
		}
		for (const [field, links] of [
			["supersedes", note.supersedes],
			["relates", note.relates],
		] as const) {
			for (const target of links) {
				if (ids.has(target)) continue;
				issues.push({
					kind: "orphan-link",
					noteId: note.id,
					otherId: target,
					scope: note.scope,
					message: `[[${note.id}]] ${field} [[${target}]], which does not exist.`,
				});
			}
		}
	}

	const inbox = listInbox(root).length;
	if (inbox > 0) {
		issues.push({ kind: "inbox-pending", message: `${inbox} candidate(s) waiting in inbox/. Run /memory review.` });
	}

	const rank = (kind: LintKind) => ORDER.indexOf(kind);
	return issues.sort((a, b) => rank(a.kind) - rank(b.kind));
}

/** Drop confidence one level on every review-due note. Returns changed ids. Does not commit. */
export function decayOverdue(root: string, now = new Date()): string[] {
	const date = today(now);
	const changed: string[] = [];
	for (const note of listNotes(root)) {
		if (!isReviewDue(note, date)) continue;
		const from = note.confidence;
		note.confidence = demoted(from);
		note.review_after = addDays(date, DECAY_DAYS);
		writeNote(root, note);
		appendLog(root, "decay", note.id, `${from} -> ${note.confidence}`);
		changed.push(note.id);
	}
	return changed;
}

/** Apply the user's choice for one flagged note. Does not commit or rebuild the index. */
export function applyLintAction(root: string, noteId: string, action: LintAction, now = new Date()): string {
	const note = listNotes(root).find((n) => n.id === noteId);
	if (!note) throw new Error(`No note with id "${noteId}".`);
	const date = today(now);
	switch (action) {
		case "confirm": {
			note.confidence = "high";
			note.confirmed = date;
			note.review_after = addDays(date, CONFIRM_DAYS);
			writeNote(root, note);
			appendLog(root, "confirm", note.id);
			return `Confirmed [[${note.id}]]: high confidence, next review ${note.review_after}.`;
		}
		case "demote": {
			const from = note.confidence;
			note.confidence = demoted(from);
			writeNote(root, note);
			appendLog(root, "demote", note.id, `${from} -> ${note.confidence}`);
			return from === note.confidence
				? `[[${note.id}]] is already low confidence.`
				: `Demoted [[${note.id}]]: ${from} -> ${note.confidence}.`;
		}
		case "delete": {
			removeNote(note);
			appendLog(root, "delete", note.id, note.summary);
			return `Deleted [[${note.id}]].`;
		}
		case "keep":
			return `Kept [[${note.id}]] unchanged.`;
		default: {
			const unknown: never = action;
			throw new Error(`Unknown lint action "${String(unknown)}".`);
		}
	}
}

export function formatReport(issues: LintIssue[]): string {
	if (!issues.length) return "No issues.";
	const lines = [`# Memory lint: ${issues.length} issue(s)`];
	for (const kind of ORDER) {
		const group = issues.filter((i) => i.kind === kind);
		if (!group.length) continue;
		lines.push("", `## ${LABELS[kind]} (${group.length})`, "");
		for (const issue of group) lines.push(`- ${issue.message}`);
	}
	return `${lines.join("\n")}\n`;
}
