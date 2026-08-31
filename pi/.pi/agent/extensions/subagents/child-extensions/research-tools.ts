/**
 * Dedicated child-extension entry that grants ONLY the read-only research
 * toolset (web + QMD) to a subagent, without loading the full aggregate
 * `superpowers` extension (which would also register unrelated hooks and
 * tools). This is the single verified entry point the `research` profile loads
 * via `--no-extensions -e <this>`.
 */
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { init as initWebSearch } from "../../superpowers/web-search.ts";
import { init as initQmd } from "../../superpowers/qmd.ts";

export default function (pi: ExtensionAPI) {
  const enabled = () => true;
  try {
    initWebSearch(pi, enabled);
  } catch {
    // If the web-search backing module is unavailable, the requested tools
    // simply won't be registered and the allowlist entry fails closed.
  }
  try {
    initQmd(pi, enabled);
  } catch {
    // Same fail-closed behavior for QMD.
  }
}
