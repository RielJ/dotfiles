/**
 * Standing Rules
 *
 * Compaction summaries keep few of the rules a user states in chat ("commit
 * file by file", "use the @/ alias"). Once the message is summarized away, the
 * model never sees the rule again. This extension finds rule-like sentences in
 * the user's own summarized messages and puts them back, verbatim, right after
 * the compaction summary. It works with any compaction method (pi-vcc or Pi's
 * own) because it reads the session branch, not the summary.
 *
 * Measured in evals/compaction: pi-vcc alone kept 2 of 20 real rules; with
 * this, 15 of 20, for about 2k more context tokens after a compaction.
 *
 * It does nothing before the first compaction. Rules that should outlive the
 * session still belong in AGENTS.md or memory.
 *
 * Environment variables:
 *   PI_STANDING_RULES_DISABLE — set to any value to turn the extension off
 *
 * Command:
 *   /standing-rules — show the rules currently injected
 */
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { standingRules, withStandingRules } from "./inject.ts";

export default function standingRulesExtension(pi: ExtensionAPI) {
  if (process.env.PI_STANDING_RULES_DISABLE) return;

  pi.on("context", (event, ctx) => {
    const rules = standingRules(ctx.sessionManager.getBranch());
    if (!rules) return;
    const messages = withStandingRules(event.messages, rules);
    if (messages !== event.messages) return { messages };
  });

  pi.registerCommand("standing-rules", {
    description: "Show the standing rules injected after compaction",
    handler: async (_args, ctx) => {
      const rules = standingRules(ctx.sessionManager.getBranch());
      ctx.ui.notify(
        rules
          ? `${rules.kept} of ${rules.found} rules injected:\n${rules.text}`
          : "No rules injected: no compaction yet, or no rules found in the summarized messages.",
        "info",
      );
    },
  });
}
