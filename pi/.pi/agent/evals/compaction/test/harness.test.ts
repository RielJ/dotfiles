import assert from "node:assert/strict";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, before, describe, it } from "node:test";

import { type Case, runCase } from "../evaluate.ts";
import { PROFILES } from "../replay.ts";
import { countOccurrences, normalize, scoreCommitment } from "../score.ts";
import { generateSyntheticSession, PLANTED_COMMITMENTS } from "../synthetic.ts";
import {
  noneVariant,
  piVccHookPath,
  piVccVariant,
  type Variant,
} from "../variants.ts";

let dir = "";
let session = "";
let lastUserEntryId = "";
before(() => {
  dir = mkdtempSync(join(tmpdir(), "compaction-eval-"));
  session = join(dir, "synthetic.jsonl");
  ({ lastUserEntryId } = generateSyntheticSession(session));
});
after(() => rmSync(dir, { recursive: true, force: true }));

const synthetic = (): Case => ({
  id: "synthetic",
  session,
  commitments: PLANTED_COMMITMENTS,
});

describe("score", () => {
  it("normalizes whitespace and counts non-overlapping matches", () => {
    assert.equal(normalize("  a \n\t b "), "a b");
    assert.equal(countOccurrences("abab ab", "ab"), 3);
    assert.equal(countOccurrences("abc", ""), 0);
  });

  it("labels intact, partial, absent and invalid", () => {
    const c = {
      id: "x",
      kind: "constraint" as const,
      keys: ["rule one", "except two"],
    };
    const src = "rule one except two";
    assert.equal(
      scoreCommitment(c, src, "rule one except two", "").status,
      "intact",
    );
    assert.equal(scoreCommitment(c, src, "rule one", "").status, "partial");
    assert.equal(scoreCommitment(c, src, "", "nothing").status, "absent");
    assert.equal(
      scoreCommitment(c, "rule one rule one except two", "", "").status,
      "invalid",
    );
  });
});

describe("harness sanity", () => {
  it("known pass: the no-compaction control keeps every commitment intact", async () => {
    const run = await runCase(synthetic(), noneVariant, PROFILES.real);
    assert.ok(run.ok, run.ok ? "" : run.error);
    assert.deepEqual(
      run.scores.map((s) => s.status),
      PLANTED_COMMITMENTS.map(() => "intact"),
    );
    assert.equal(run.cost.compactions.length, 0);
  });

  it("known fail: a key that never appears in the session is invalid, not absent", async () => {
    const c: Case = {
      ...synthetic(),
      commitments: [
        {
          id: "ghost",
          kind: "constraint",
          keys: ["this sentence was never said"],
        },
      ],
    };
    const run = await runCase(c, noneVariant, PROFILES.real);
    assert.ok(run.ok);
    assert.equal(run.scores[0].status, "invalid");
  });

  it("broken: a missing session file is an error row, never a score", async () => {
    const run = await runCase(
      { ...synthetic(), session: join(dir, "missing.jsonl") },
      noneVariant,
      PROFILES.real,
    );
    assert.equal(run.ok, false);
    assert.match(run.ok ? "" : run.error, /not found/);
  });

  it("broken: a method that throws is an error row", async () => {
    const throwing: Variant = {
      name: "throws",
      compact: async () => {
        throw new Error("boom");
      },
    };
    const run = await runCase(synthetic(), throwing, PROFILES.stress);
    assert.equal(run.ok, false);
  });

  it("a summary that drops everything scores absent", async () => {
    const amnesia: Variant = {
      name: "amnesia",
      compact: async ({ preparation }) => ({
        summary: "(nothing)",
        firstKeptEntryId: preparation.firstKeptEntryId,
        tokensBefore: preparation.tokensBefore,
      }),
    };
    const run = await runCase(synthetic(), amnesia, PROFILES.stress);
    assert.ok(run.ok, run.ok ? "" : run.error);
    assert.ok(run.cost.compactions.length > 0);
    assert.ok(run.scores.every((s) => s.status === "absent"));
    assert.ok(
      run.cost.peakTokens <= PROFILES.stress.window,
      `peak ${run.cost.peakTokens}`,
    );
  });

  it("probeAt stops the replay before that entry", async () => {
    const run = await runCase(
      { ...synthetic(), probeAt: lastUserEntryId },
      noneVariant,
      PROFILES.real,
    );
    const full = await runCase(synthetic(), noneVariant, PROFILES.real);
    assert.ok(run.ok && full.ok);
    assert.equal(full.cost.requests - run.cost.requests, 2);
  });
});

describe(
  "pi-vcc",
  { skip: !existsSync(piVccHookPath()) && "pi-vcc not installed" },
  () => {
    it("compacts under the stress profile and stays within the window", async () => {
      const run = await runCase(
        synthetic(),
        await piVccVariant(),
        PROFILES.stress,
      );
      assert.ok(run.ok, run.ok ? "" : run.error);
      assert.ok(run.cost.compactions.length > 0);
      assert.ok(
        run.cost.peakTokens <= PROFILES.stress.window,
        `peak ${run.cost.peakTokens}`,
      );
      for (const s of run.scores) assert.notEqual(s.status, "invalid", s.id);
    });
  },
);
