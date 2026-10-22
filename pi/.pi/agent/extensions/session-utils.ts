/**
 * Session Utilities — /clear
 *
 * /clear — start a fresh session (new context, clean slate)
 *
 * Compaction is handled by pi-vcc (algorithmic, zero-cost, with vcc_recall search).
 * pi-vcc takes over auto-compaction on its own via `overrideDefaultCompaction`
 * in pi-vcc-config.json. Do not stamp `__pi_vcc__` onto auto compactions here:
 * this file loads before packages, so pi-vcc would treat every auto compaction
 * as a manual /pi-vcc run, which skips its stats toast and cancels (instead of
 * falling back to core) an overflow compaction it cannot cut.
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

export default function (pi: ExtensionAPI) {
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
