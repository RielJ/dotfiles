export interface Commitment {
  id: string;
  kind: "constraint" | "decision" | "fact";
  /** Exact substrings; each must occur once in the source session. Put a rule's qualifying clause in its own key. */
  keys: string[];
  note?: string;
}

export type Status = "intact" | "partial" | "absent" | "invalid";

export interface KeyHit {
  key: string;
  sourceCount: number;
  inSummary: boolean;
  inKept: boolean;
}

export interface CommitmentScore {
  id: string;
  status: Status;
  hits: KeyHit[];
}

export function normalize(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

export function countOccurrences(haystack: string, needle: string): number {
  if (!needle) return 0;
  let count = 0;
  let from = 0;
  for (;;) {
    const at = haystack.indexOf(needle, from);
    if (at < 0) return count;
    count++;
    from = at + needle.length;
  }
}

/** Score one commitment. Texts must already be normalized. */
export function scoreCommitment(
  c: Commitment,
  source: string,
  summary: string,
  kept: string,
): CommitmentScore {
  const hits = c.keys.map((raw) => {
    const key = normalize(raw);
    return {
      key,
      sourceCount: countOccurrences(source, key),
      inSummary: summary.includes(key),
      inKept: kept.includes(key),
    };
  });
  if (hits.length === 0 || hits.some((h) => h.sourceCount !== 1))
    return { id: c.id, status: "invalid", hits };
  const present = hits.filter((h) => h.inSummary || h.inKept).length;
  if (present === hits.length) return { id: c.id, status: "intact", hits };
  return { id: c.id, status: present > 0 ? "partial" : "absent", hits };
}
