/** /memory save | review | lint | status */
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { applyLintAction, decayOverdue, type LintAction, lintStore, formatReport } from "./lint.ts";
import type { MemoryState } from "./state.ts";
import { loadStats } from "./stats.ts";
import {
	addCoreRule,
	addDays,
	appendLog,
	commit,
	listInbox,
	listNotes,
	type Note,
	promote,
	rebuildIndex,
	removeNote,
	type Scope,
	today,
} from "./store.ts";
import { saveMemory, similarity } from "./write.ts";

/** The subset of ctx.ui the flows use, so tests can drive them. */
export interface MemoryUI {
	select(title: string, options: string[]): Promise<string | undefined>;
	input(title: string, placeholder?: string): Promise<string | undefined>;
	notify(message: string, type?: "info" | "warning" | "error"): void;
}

const CORE_PROPOSAL = "(Proposed as a core.md rule.)";

async function pickScope(state: MemoryState, ui: MemoryUI): Promise<Scope | undefined> {
	if (!state.repoKey) return "global";
	const repo = `This repo (${state.repoKey})`;
	const choice = await ui.select("Save to", [repo, "Global (all repos)"]);
	if (!choice) return undefined;
	return choice === repo ? `repo:${state.repoKey}` : "global";
}

export async function runSave(state: MemoryState, ui: MemoryUI, args: string): Promise<string> {
	let summary = args.trim();
	if (!summary) summary = (await ui.input("What should be remembered?", "One claim, e.g. Use pnpm, never npm"))?.trim() ?? "";
	if (!summary) return "Cancelled.";
	const why = (await ui.input("Why? (what it prevents or why it was decided)"))?.trim();
	if (!why) return "Cancelled: a why is required.";
	const scope = await pickScope(state, ui);
	if (!scope) return "Cancelled.";
	const kind = await ui.select("Save as", ["Note (searchable)", "core.md rule (loaded every session)"]);
	if (!kind) return "Cancelled.";
	try {
		const result = saveMemory(
			{ summary, why, scope, core: kind.startsWith("core"), requestedBy: "user" },
			{ root: state.root, index: state.index(), tainted: false },
		);
		return result.message;
	} catch (error) {
		return error instanceof Error ? error.message : String(error);
	}
}

export async function runReview(state: MemoryState, ui: MemoryUI): Promise<string> {
	const inbox = listInbox(state.root);
	if (!inbox.length) return "Inbox is empty.";
	const existing = listNotes(state.root);
	const counts = { approved: 0, rejected: 0, skipped: 0 };
	for (const [i, note] of inbox.entries()) {
		const dup = existing.find((n) => n.scope === note.scope && similarity(n.summary, note.summary) >= 0.75);
		const proposedCore = note.body.includes(CORE_PROPOSAL);
		const title = [
			`[${i + 1}/${inbox.length}] ${note.scope} · ${note.type} · from ${note.source}`,
			note.summary,
			`why: ${note.why}`,
			dup ? `Similar existing note: [[${dup.id}]] ${dup.summary}` : "",
		]
			.filter(Boolean)
			.join("\n");
		const options = [
			"Approve",
			"Approve and confirm (high confidence)",
			...(proposedCore ? ["Add to core.md"] : []),
			"Edit, then approve",
			"Reject",
			"Skip",
			"Stop reviewing",
		];
		const choice = await ui.select(title, options);
		if (!choice || choice === "Stop reviewing") break;
		if (choice === "Skip") {
			counts.skipped++;
			continue;
		}
		if (choice === "Reject") {
			removeNote(note);
			appendLog(state.root, "reject", note.id, note.summary);
			counts.rejected++;
			continue;
		}
		const body = note.body.replace(CORE_PROPOSAL, "").trim();
		if (choice === "Add to core.md") {
			try {
				addCoreRule(state.root, note.scope, note.summary, note.why);
				removeNote(note);
				appendLog(state.root, "approve-core", note.id, note.summary);
				counts.approved++;
			} catch (error) {
				ui.notify(error instanceof Error ? error.message : String(error), "warning");
				counts.skipped++;
			}
			continue;
		}
		const approved: Note = { ...note, body, confidence: "medium" };
		if (choice === "Edit, then approve") {
			approved.summary = (await ui.input("Summary", note.summary))?.trim() || note.summary;
			approved.why = (await ui.input("Why", note.why))?.trim() || note.why;
		}
		if (choice.startsWith("Approve and confirm")) {
			const date = today();
			approved.confidence = "high";
			approved.confirmed = date;
			approved.review_after = addDays(date, 180);
		}
		promote(state.root, approved);
		appendLog(state.root, "approve", note.id, approved.summary);
		counts.approved++;
	}
	rebuildIndex(state.root);
	commit(state.root, `memory: review (${counts.approved} approved, ${counts.rejected} rejected)`);
	const left = listInbox(state.root).length;
	return `Review: ${counts.approved} approved, ${counts.rejected} rejected, ${counts.skipped} skipped. ${left} left in inbox.`;
}

const ACTIONS: Record<string, LintAction> = {
	"Confirm (high confidence, review in 180 days)": "confirm",
	"Demote one level": "demote",
	Delete: "delete",
	Keep: "keep",
};

export async function runLint(state: MemoryState, ui: MemoryUI, now = new Date()): Promise<string> {
	const decayed = decayOverdue(state.root, now);
	const issues = lintStore(state.root, { now, stats: loadStats(state.root) });
	const report = formatReport(issues);
	writeFileSync(join(state.root, "lint-report.md"), `# Memory lint ${today(now)}\n\n${report}\n`);
	const actionable = issues.filter((i) => i.noteId);
	let applied = 0;
	if (actionable.length) {
		const go = await ui.select(`${issues.length} issue(s), ${decayed.length} note(s) decayed. Report: ~/.pi/memory/lint-report.md`, [
			"Go through flagged notes",
			"Just keep the report",
		]);
		if (go === "Go through flagged notes") {
			const seen = new Set<string>();
			for (const issue of actionable) {
				const id = issue.noteId as string;
				if (seen.has(id)) continue;
				seen.add(id);
				const choice = await ui.select(`${issue.kind}: ${issue.message}`, [...Object.keys(ACTIONS), "Stop"]);
				if (!choice || choice === "Stop") break;
				try {
					ui.notify(applyLintAction(state.root, id, ACTIONS[choice], now), "info");
					if (ACTIONS[choice] !== "keep") applied++;
				} catch (error) {
					ui.notify(error instanceof Error ? error.message : String(error), "warning");
				}
			}
		}
	}
	rebuildIndex(state.root);
	commit(state.root, `memory: lint (${decayed.length} decayed, ${applied} changed)`);
	return issues.length
		? `Lint: ${issues.length} issue(s), ${decayed.length} decayed, ${applied} changed. Report: ~/.pi/memory/lint-report.md`
		: `Lint: no issues${decayed.length ? `, ${decayed.length} decayed` : ""}.`;
}

export function statusText(state: MemoryState, now = new Date()): string {
	const notes = listNotes(state.root);
	const byScope = new Map<string, Record<string, number>>();
	for (const n of notes) {
		const row = byScope.get(n.scope) ?? { high: 0, medium: 0, low: 0 };
		row[n.confidence]++;
		byScope.set(n.scope, row);
	}
	const stats = loadStats(state.root);
	let injected = 0;
	for (let d = 0; d < 7; d++) {
		const date = today(new Date(now.getTime() - d * 86_400_000));
		injected += stats.injected[date] ?? 0;
	}
	const weekAgo = today(new Date(now.getTime() - 7 * 86_400_000));
	const used = Object.values(stats.notes).filter((s) => s.last >= weekAgo).length;
	const lines = [
		`Memory: ${state.root}`,
		`Repo: ${state.repoKey ?? "(not in a git repo)"} · core block: ${state.coreBlock ? `${state.coreBlock.tokens} tokens` : "empty"}`,
		`Notes: ${notes.length} · inbox: ${listInbox(state.root).length}`,
		...[...byScope.entries()].map(([scope, c]) => `  ${scope}: ${c.high} high, ${c.medium} medium, ${c.low} low`),
		`Last 7 days: ${injected} core tokens injected, ${used} note(s) searched or read`,
		`Session: ${state.taint.tainted ? `read outside content (${state.taint.reason}); agent saves go to inbox` : "clean"}`,
	];
	return lines.join("\n");
}

const HELP = "Usage: /memory save <text> | review | lint | status";

export function registerCommands(pi: ExtensionAPI, getState: () => MemoryState | null): void {
	pi.registerCommand("memory", {
		description: "Long-term memory: save, review the inbox, lint, status",
		getArgumentCompletions: (prefix) =>
			["save", "review", "lint", "status"]
				.filter((s) => s.startsWith(prefix.trim()))
				.map((s) => ({ value: s, label: s })),
		handler: async (args, ctx) => {
			const state = getState();
			if (!state) {
				ctx.ui.notify("Memory is not initialised for this session.", "warning");
				return;
			}
			const [sub = "status", ...rest] = args.trim().split(/\s+/);
			const ui: MemoryUI = ctx.ui;
			let message: string;
			switch (sub) {
				case "save":
					message = await runSave(state, ui, rest.join(" "));
					break;
				case "review":
					message = await runReview(state, ui);
					break;
				case "lint":
					message = await runLint(state, ui);
					break;
				case "status":
					message = statusText(state);
					break;
				default:
					message = HELP;
			}
			ctx.ui.notify(message, "info");
		},
	});
}
