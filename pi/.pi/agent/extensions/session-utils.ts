/**
 * Session Utilities — /clear + auto-compaction
 *
 * /clear          — start a fresh session (new context, clean slate)
 * /clear soft     — compact current context into a summary (keeps session)
 * /clear <topic>  — compact with focus on a specific topic
 *
 * Auto-compaction: triggers at 85% context usage after each turn.
 */

import type { ExtensionAPI, ExtensionContext } from "@mariozechner/pi-coding-agent";

const AUTO_COMPACT_THRESHOLD = 0.85; // 85% of max context
let isCompacting = false;

function triggerAutoCompact(ctx: ExtensionContext) {
	if (isCompacting) return;
	isCompacting = true;

	if (ctx.hasUI) {
		ctx.ui.notify("⚡ Auto-compacting context (85% full)...", "info");
	}

	ctx.compact({
		customInstructions: "Preserve all key decisions, file paths, current task state, and recent context. Summarize older conversation concisely.",
		onComplete: () => {
			isCompacting = false;
			if (ctx.hasUI) {
				ctx.ui.notify("✓ Auto-compaction complete.", "info");
			}
		},
		onError: (err) => {
			isCompacting = false;
			if (ctx.hasUI) {
				ctx.ui.notify(`Auto-compaction failed: ${err.message}`, "error");
			}
		},
	});
}

export default function (pi: ExtensionAPI) {
	// ── Auto-compaction on turn end ──
	pi.on("turn_end", async (_event, ctx) => {
		if (isCompacting) return;
		try {
			const usage = ctx.getContextUsage();
			if (!usage || usage.tokens == null || !usage.maxTokens) return;
			const pct = usage.tokens / usage.maxTokens;
			if (pct >= AUTO_COMPACT_THRESHOLD) {
				triggerAutoCompact(ctx);
			}
		} catch {}
	});
	pi.registerCommand("clear", {
		description: "Clear context. /clear = new session, /clear soft = compact, /clear <topic> = compact focused on topic",
		handler: async (args, ctx) => {
			const raw = args?.trim().toLowerCase() || "";

			if (!raw) {
				// Full clear — new session
				const ok = await ctx.ui.confirm(
					"Clear session?",
					"This starts a fresh session. Current session is saved and can be resumed with /resume.",
				);
				if (!ok) {
					ctx.ui.notify("Cancelled.", "info");
					return;
				}
				await ctx.newSession();
				ctx.ui.notify("Session cleared. Fresh start.", "info");
				return;
			}

			// Soft clear — compact the context
			const isSoft = raw === "soft" || raw === "compact";
			const customInstructions = isSoft
				? undefined
				: `Focus the summary on: ${args!.trim()}. Preserve details related to this topic and summarize everything else briefly.`;

			ctx.compact({
				customInstructions,
				onComplete: () => {
					const msg = isSoft
						? "Context compacted into a summary."
						: `Context compacted with focus on: ${args!.trim()}`;
					ctx.ui.notify(msg, "info");
				},
				onError: (err) => {
					ctx.ui.notify(`Compaction failed: ${err.message}`, "error");
				},
			});

			ctx.ui.notify("Compacting context...", "info");
		},
	});


}
