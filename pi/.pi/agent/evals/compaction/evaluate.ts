import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, isAbsolute, resolve } from "node:path";
import { type Profile, type ReplayResult, replay } from "./replay.ts";
import {
  type Commitment,
  type CommitmentScore,
  normalize,
  scoreCommitment,
} from "./score.ts";
import { entryText, loadReplayEntries } from "./session.ts";
import type { Variant } from "./variants.ts";

export interface Case {
  id: string;
  session: string;
  probeAt?: string;
  commitments: Commitment[];
}

export type CaseRun =
  | {
      caseId: string;
      variant: string;
      profile: string;
      ok: true;
      scores: CommitmentScore[];
      cost: Omit<ReplayResult, "summaryText" | "keptText">;
    }
  | {
      caseId: string;
      variant: string;
      profile: string;
      ok: false;
      error: string;
    };

function expandPath(path: string, baseDir: string): string {
  if (path.startsWith("~/")) return resolve(homedir(), path.slice(2));
  return isAbsolute(path) ? path : resolve(baseDir, path);
}

function isCase(value: unknown): value is Case {
  return (
    typeof value === "object" &&
    value !== null &&
    "id" in value &&
    typeof value.id === "string" &&
    "session" in value &&
    typeof value.session === "string" &&
    "commitments" in value &&
    Array.isArray(value.commitments)
  );
}

/** Read a case file. Session paths resolve relative to the case file. */
export function loadCases(file: string): Case[] {
  const parsed: unknown = JSON.parse(readFileSync(file, "utf8"));
  if (
    typeof parsed !== "object" ||
    parsed === null ||
    !("cases" in parsed) ||
    !Array.isArray(parsed.cases)
  )
    throw new Error(`${file}: expected { "cases": [...] }`);
  return parsed.cases.map((c: unknown, i: number) => {
    if (!isCase(c))
      throw new Error(`${file}: case ${i} needs id, session and commitments`);
    return { ...c, session: expandPath(c.session, dirname(file)) };
  });
}

/** Replay one case with one method and profile. Any failure is an error row, never "absent". */
export async function runCase(
  c: Case,
  variant: Variant,
  profile: Profile,
): Promise<CaseRun> {
  const base = { caseId: c.id, variant: variant.name, profile: profile.name };
  try {
    if (!existsSync(c.session))
      throw new Error(`session file not found: ${c.session}`);
    const entries = loadReplayEntries(c.session);
    const probeAt = c.probeAt ?? "end";
    if (probeAt !== "end" && !entries.some((e) => e.id === probeAt))
      throw new Error(`probeAt entry ${probeAt} not in active branch`);
    const stop =
      probeAt === "end"
        ? entries.length
        : entries.findIndex((e) => e.id === probeAt);
    const source = normalize(entries.slice(0, stop).map(entryText).join("\n"));
    const r = await replay(entries, variant, profile, probeAt);
    const summary = normalize(r.summaryText);
    const kept = normalize(r.keptText);
    const scores = c.commitments.map((cm) =>
      scoreCommitment(cm, source, summary, kept),
    );
    const { summaryText: _s, keptText: _k, ...cost } = r;
    return { ...base, ok: true, scores, cost };
  } catch (err) {
    return {
      ...base,
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}
