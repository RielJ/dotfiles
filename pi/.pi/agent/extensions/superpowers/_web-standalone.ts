/**
 * Standalone entry for web-search.ts, so subagents can load web_search and
 * web_read with `pi -e`. The superpowers index loads web-search.ts through
 * its own `init`; pi's `-e` needs a default export. The leading underscore
 * keeps the index from loading this file a second time.
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { init } from "./web-search.js";

export default function webSearchStandalone(pi: ExtensionAPI): void {
  init(pi, () => true);
}
