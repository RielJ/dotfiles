import type {
  SessionBeforeCompactEvent,
  SessionEntry,
} from "@earendil-works/pi-coding-agent";

/**
 * Pi does not export prepareCompaction from its package entry, so load it from
 * the dist file next to the entry. Fails loudly if a Pi upgrade moves it.
 */
export type CompactionPreparation = SessionBeforeCompactEvent["preparation"];
export type CompactionSettings = CompactionPreparation["settings"];
type PrepareCompaction = (
  entries: SessionEntry[],
  settings: CompactionSettings,
) => CompactionPreparation | undefined;

const entryUrl = import.meta.resolve("@earendil-works/pi-coding-agent");
const compactionUrl = new URL("./core/compaction/compaction.js", entryUrl).href;
const mod: unknown = await import(compactionUrl);

function hasPrepare(
  value: unknown,
): value is { prepareCompaction: PrepareCompaction } {
  return (
    typeof value === "object" &&
    value !== null &&
    "prepareCompaction" in value &&
    typeof value.prepareCompaction === "function"
  );
}
if (!hasPrepare(mod))
  throw new Error(
    `prepareCompaction not found in ${compactionUrl}; Pi's internal layout changed`,
  );

export const prepareCompaction: PrepareCompaction = mod.prepareCompaction;
