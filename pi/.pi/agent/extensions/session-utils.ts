/**
 * Session Utilities — /clear
 *
 * /clear — start a fresh session (new context, clean slate)
 *
 * Compaction is handled by pi-vcc (algorithmic, zero-cost, with vcc_recall search).
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

export default function (pi: ExtensionAPI) {
	// Make pi-vcc the default compactor for auto-compaction
	pi.on("session_before_compact", (event: any) => {
		if (!event.customInstructions) {
			event.customInstructions = "__pi_vcc__";
		}
	});

	pi.registerCommand("clear", {
		description: "Start a fresh session. Current session is saved and can be resumed with /resume.",
		handler: async (_args, ctx) => {
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
		},
	});
}
