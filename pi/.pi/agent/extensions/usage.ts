/**
 * Usage Tracker — /usage
 *
 * Shows token usage and cost breakdown per model for the current session,
 * plus weekly aggregate usage with plan budget tracking.
 *
 * Configure your plan in ~/.pi/agent/settings.json:
 *   "usage": {
 *     "plan": "max",          // "pro" | "max" | "max20x" | "api" | "team"
 *     "weeklyBudget": 50      // optional override in dollars
 *   }
 */

import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";

// ── Plan Definitions ────────────────────────────────────────────────

const PLANS: Record<string, { name: string; monthlyPrice: number; weeklyBudget: number; note: string }> = {
	pro:    { name: "Claude Pro",       monthlyPrice: 20,  weeklyBudget: 5,   note: "$20/mo — 5x free usage" },
	max:    { name: "Claude Max",       monthlyPrice: 100, weeklyBudget: 25,  note: "$100/mo — 20x free usage" },
	max20x: { name: "Claude Max (20x)", monthlyPrice: 200, weeklyBudget: 50,  note: "$200/mo — 40x free usage" },
	team:   { name: "Claude Team",      monthlyPrice: 30,  weeklyBudget: 7.5, note: "$30/seat/mo" },
	api:    { name: "API (pay-as-you-go)", monthlyPrice: 0, weeklyBudget: 0,  note: "No fixed budget" },
};

// ── Usage Log ───────────────────────────────────────────────────────

interface UsageEntry {
	date: string;       // ISO date YYYY-MM-DD
	provider: string;
	model: string;
	tokens: number;
	cost: number;
	calls: number;
}

interface UsageLog {
	entries: UsageEntry[];
	lastSessionId?: string;
}

function getUsageLogPath(): string {
	return path.join(os.homedir(), ".pi", "agent", "usage-log.json");
}

function loadUsageLog(): UsageLog {
	try {
		const raw = fs.readFileSync(getUsageLogPath(), "utf-8");
		return JSON.parse(raw);
	} catch {
		return { entries: [] };
	}
}

function saveUsageLog(log: UsageLog) {
	try {
		const dir = path.dirname(getUsageLogPath());
		fs.mkdirSync(dir, { recursive: true });
		fs.writeFileSync(getUsageLogPath(), JSON.stringify(log, null, 2), "utf-8");
	} catch {}
}

function getWeekStart(): string {
	const now = new Date();
	const day = now.getDay(); // 0=Sun
	const diff = now.getDate() - day + (day === 0 ? -6 : 1); // Monday
	const monday = new Date(now.setDate(diff));
	return monday.toISOString().slice(0, 10);
}

function getWeeklyUsage(log: UsageLog): { byModel: Map<string, { tokens: number; cost: number; calls: number }>; totalCost: number; totalTokens: number } {
	const weekStart = getWeekStart();
	const byModel = new Map<string, { tokens: number; cost: number; calls: number }>();
	let totalCost = 0;
	let totalTokens = 0;

	for (const e of log.entries) {
		if (e.date < weekStart) continue;
		const key = `${e.provider}/${e.model}`;
		const existing = byModel.get(key);
		if (existing) {
			existing.tokens += e.tokens;
			existing.cost += e.cost;
			existing.calls += e.calls;
		} else {
			byModel.set(key, { tokens: e.tokens, cost: e.cost, calls: e.calls });
		}
		totalCost += e.cost;
		totalTokens += e.tokens;
	}

	return { byModel, totalCost, totalTokens };
}

// ── Formatting ──────────────────────────────────────────────────────

function formatTokens(n: number | undefined | null): string {
	if (n == null || isNaN(n)) return "0";
	if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + "M";
	if (n >= 1_000) return (n / 1_000).toFixed(1) + "k";
	return n.toString();
}

function formatCost(n: number | undefined | null): string {
	if (n == null || isNaN(n)) return "$0.00";
	if (n < 0.001 && n > 0) return "<$0.01";
	if (n < 1) return "$" + n.toFixed(2);
	return "$" + n.toFixed(2);
}

function progressBar(used: number, total: number, width = 20): string {
	if (total <= 0) return "";
	const pct = Math.min(used / total, 1);
	const filled = Math.round(pct * width);
	const empty = width - filled;
	const bar = "█".repeat(filled) + "░".repeat(empty);
	const pctStr = (pct * 100).toFixed(0) + "%";
	return `\`${bar}\` ${pctStr}`;
}

// ── Settings ────────────────────────────────────────────────────────

interface UsageSettings {
	plan?: string;
	weeklyBudget?: number;
}

function loadSettings(): UsageSettings {
	try {
		const raw = fs.readFileSync(path.join(os.homedir(), ".pi", "agent", "settings.json"), "utf-8");
		const settings = JSON.parse(raw);
		return settings.usage || {};
	} catch {
		return {};
	}
}

// ── Extension ───────────────────────────────────────────────────────

interface ModelUsage {
	provider: string;
	model: string;
	calls: number;
	inputTokens: number;
	outputTokens: number;
	cacheReadTokens: number;
	cacheWriteTokens: number;
	totalTokens: number;
	totalCost: number;
}

export default function (pi: ExtensionAPI) {
	let lastLoggedSessionId: string | undefined;

	// Log session usage on end
	pi.on("session_end" as any, async (_ev: any, ctx: any) => {
		try { logSessionUsage(ctx); } catch {}
	});

	function logSessionUsage(ctx: any) {
		const entries = ctx?.sessionManager?.getBranch?.();
		if (!entries) return;

		const sessionId = ctx?.sessionManager?.getSessionFile?.() || "unknown";
		const log = loadUsageLog();

		// Skip if already logged this session
		if (log.lastSessionId === sessionId && lastLoggedSessionId === sessionId) return;

		const today = new Date().toISOString().slice(0, 10);
		const byModel = new Map<string, UsageEntry>();

		for (const entry of entries as any[]) {
			if (entry.type !== "message") continue;
			const msg = entry.message;
			if (!msg || msg.role !== "assistant" || !msg.usage) continue;

			const key = `${msg.provider || "unknown"}/${msg.model || "unknown"}`;
			const u = msg.usage;
			const existing = byModel.get(key);

			if (existing) {
				existing.tokens += u.totalTokens || 0;
				existing.cost += u.cost?.total || 0;
				existing.calls++;
			} else {
				byModel.set(key, {
					date: today,
					provider: msg.provider || "unknown",
					model: msg.model || "unknown",
					tokens: u.totalTokens || 0,
					cost: u.cost?.total || 0,
					calls: 1,
				});
			}
		}

		// Append new entries
		for (const e of byModel.values()) {
			if (e.cost > 0 || e.tokens > 0) log.entries.push(e);
		}

		log.lastSessionId = sessionId;
		lastLoggedSessionId = sessionId;

		// Prune entries older than 30 days
		const cutoff = new Date();
		cutoff.setDate(cutoff.getDate() - 30);
		const cutoffStr = cutoff.toISOString().slice(0, 10);
		log.entries = log.entries.filter(e => e.date >= cutoffStr);

		saveUsageLog(log);
	}

	pi.registerCommand("usage", {
		description: "Show session + weekly usage with plan budget. /usage [set pro|max|max20x|team|api]",
		handler: async (args, ctx) => {
			const trimmed = args?.trim() || "";

			// ── /usage set <plan> — configure plan ──
			if (trimmed.startsWith("set ")) {
				const planKey = trimmed.slice(4).trim().toLowerCase();
				if (!PLANS[planKey]) {
					const available = Object.entries(PLANS).map(([k, v]) => `  \`${k}\` — ${v.note}`).join("\n");
					ctx.ui.notify(`Unknown plan. Available:\n${available}`, "warning");
					return;
				}
				try {
					const settingsPath = path.join(os.homedir(), ".pi", "agent", "settings.json");
					const raw = fs.existsSync(settingsPath) ? fs.readFileSync(settingsPath, "utf-8") : "{}";
					const settings = JSON.parse(raw);
					settings.usage = { ...settings.usage, plan: planKey };
					fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2), "utf-8");
					ctx.ui.notify(`Plan set to: ${PLANS[planKey].name} (${PLANS[planKey].note})`, "info");
				} catch (e: any) {
					ctx.ui.notify(`Failed to save: ${e.message}`, "error");
				}
				return;
			}

			// ── Log current session before showing ──
			try { logSessionUsage(ctx); } catch {}

			// ── Gather session usage ──
			const entries = ctx.sessionManager.getBranch();
			const byModel = new Map<string, ModelUsage>();
			let sessionStart = 0;

			for (const entry of entries as any[]) {
				if (entry.type === "session" && entry.timestamp) {
					sessionStart = new Date(entry.timestamp).getTime();
				}
				if (entry.type !== "message") continue;
				const msg = entry.message;
				if (!msg || msg.role !== "assistant" || !msg.usage) continue;

				const key = `${msg.provider || "unknown"}/${msg.model || "unknown"}`;
				const u = msg.usage;
				const existing = byModel.get(key);

				if (existing) {
					existing.calls++;
					existing.inputTokens += u.input || 0;
					existing.outputTokens += u.output || 0;
					existing.cacheReadTokens += u.cacheRead || 0;
					existing.cacheWriteTokens += u.cacheWrite || 0;
					existing.totalTokens += u.totalTokens || 0;
					existing.totalCost += u.cost?.total || 0;
				} else {
					byModel.set(key, {
						provider: msg.provider || "unknown",
						model: msg.model || "unknown",
						calls: 1,
						inputTokens: u.input || 0,
						outputTokens: u.output || 0,
						cacheReadTokens: u.cacheRead || 0,
						cacheWriteTokens: u.cacheWrite || 0,
						totalTokens: u.totalTokens || 0,
						totalCost: u.cost?.total || 0,
					});
				}
			}

			const lines: string[] = [];

			// ── Session Usage ──
			if (byModel.size > 0) {
				const models = [...byModel.values()].sort((a, b) => b.totalCost - a.totalCost);
				const gt = { calls: 0, input: 0, output: 0, cacheRead: 0, cacheWrite: 0, tokens: 0, cost: 0 };

				lines.push("## 📊 This Session\n");

				if (sessionStart) {
					const dur = Date.now() - sessionStart;
					const hrs = Math.floor(dur / 3600000);
					const mins = Math.floor((dur % 3600000) / 60000);
					lines.push(`**Duration:** ${hrs > 0 ? hrs + "h " : ""}${mins}m\n`);
				}

				lines.push("| Model | Calls | Input | Output | Cache R | Total | Cost |");
				lines.push("|-------|------:|------:|-------:|--------:|------:|-----:|");

				for (const m of models) {
					gt.calls += m.calls; gt.input += m.inputTokens; gt.output += m.outputTokens;
					gt.cacheRead += m.cacheReadTokens; gt.tokens += m.totalTokens; gt.cost += m.totalCost;
					const name = m.model.length > 25 ? m.model.slice(0, 23) + "…" : m.model;
					lines.push(`| ${name} | ${m.calls} | ${formatTokens(m.inputTokens)} | ${formatTokens(m.outputTokens)} | ${formatTokens(m.cacheReadTokens)} | ${formatTokens(m.totalTokens)} | ${formatCost(m.totalCost)} |`);
				}

				lines.push(`| **Total** | **${gt.calls}** | **${formatTokens(gt.input)}** | **${formatTokens(gt.output)}** | **${formatTokens(gt.cacheRead)}** | **${formatTokens(gt.tokens)}** | **${formatCost(gt.cost)}** |`);
			} else {
				lines.push("## 📊 This Session\n\nNo usage yet.\n");
			}

			// ── Weekly Usage + Budget ──
			const log = loadUsageLog();
			const weekly = getWeeklyUsage(log);
			const settings = loadSettings();
			const planKey = settings.plan || "api";
			const plan = PLANS[planKey] || PLANS.api;
			const weeklyBudget = settings.weeklyBudget || plan.weeklyBudget;

			lines.push("\n## 📅 This Week\n");
			lines.push(`**Plan:** ${plan.name} ${plan.note ? `(${plan.note})` : ""}`);

			if (weekly.byModel.size > 0) {
				lines.push("");
				lines.push("| Model | Calls | Tokens | Cost |");
				lines.push("|-------|------:|-------:|-----:|");

				const sorted = [...weekly.byModel.entries()].sort((a, b) => b[1].cost - a[1].cost);
				for (const [key, val] of sorted) {
					const model = key.split("/").pop() || key;
					const name = model.length > 25 ? model.slice(0, 23) + "…" : model;
					lines.push(`| ${name} | ${val.calls} | ${formatTokens(val.tokens)} | ${formatCost(val.cost)} |`);
				}
				lines.push(`| **Weekly Total** | | **${formatTokens(weekly.totalTokens)}** | **${formatCost(weekly.totalCost)}** |`);
			} else {
				lines.push(`\n**Weekly Total:** ${formatCost(0)}`);
			}

			// Budget bar
			if (weeklyBudget > 0) {
				const remaining = Math.max(0, weeklyBudget - weekly.totalCost);
				lines.push(`\n**Budget:** ${formatCost(weekly.totalCost)} / ${formatCost(weeklyBudget)} — **${formatCost(remaining)} remaining**`);
				lines.push(progressBar(weekly.totalCost, weeklyBudget));

				// Warnings
				const pct = (weekly.totalCost / weeklyBudget) * 100;
				if (pct >= 100) {
					lines.push("\n⛔ **Weekly budget exceeded!**");
				} else if (pct >= 80) {
					lines.push(`\n⚠️ **${(100 - pct).toFixed(0)}% of weekly budget remaining**`);
				}
			}

			// Context usage
			try {
				const contextUsage = ctx.getContextUsage();
				if (contextUsage && contextUsage.tokens != null && contextUsage.maxTokens) {
					const pct = ((contextUsage.tokens / contextUsage.maxTokens) * 100).toFixed(0);
					lines.push(`\n**Context window:** ${formatTokens(contextUsage.tokens)} / ${formatTokens(contextUsage.maxTokens)} (${pct}%)`);
				}
			} catch {}

			// Tip
			if (!settings.plan) {
				lines.push(`\n*Set your plan: \`/usage set pro\`, \`/usage set max\`, \`/usage set max20x\`, \`/usage set team\`, or \`/usage set api\`*`);
			}

			pi.sendUserMessage(lines.join("\n"));
		},
	});
}
