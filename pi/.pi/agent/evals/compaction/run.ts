import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { parseArgs } from "node:util";

import { type Case, type CaseRun, loadCases, runCase } from "./evaluate.ts";
import { PROFILES, type Profile } from "./replay.ts";
import { generateSyntheticSession } from "./synthetic.ts";
import { loadVariant } from "./variants.ts";

const { values } = parseArgs({
  options: {
    cases: { type: "string" },
    synthetic: { type: "boolean", default: false },
    variants: { type: "string", default: "none,pi-vcc" },
    profiles: { type: "string", default: "real,stress" },
    out: { type: "string" },
  },
});

function pickProfiles(names: string): Profile[] {
  return names.split(",").map((n) => {
    const p = PROFILES[n.trim()];
    if (!p)
      throw new Error(
        `unknown profile "${n}" (known: ${Object.keys(PROFILES).join(", ")})`,
      );
    return p;
  });
}

function median(xs: number[]): number {
  if (xs.length === 0) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : Math.round((s[mid - 1] + s[mid]) / 2);
}

const fmt = (n: number) => n.toLocaleString("en-US");

function report(runs: CaseRun[], cases: Case[]): string {
  const out: string[] = ["# Compaction retention results", ""];
  const combos = [...new Set(runs.map((r) => `${r.variant}@${r.profile}`))];

  out.push(
    "## Retention",
    "",
    `| Commitment | ${combos.join(" | ")} |`,
    `|---|${combos.map(() => "---").join("|")}|`,
  );
  for (const c of cases) {
    for (const cm of c.commitments) {
      const cells = combos.map((combo) => {
        const run = runs.find(
          (r) => r.caseId === c.id && `${r.variant}@${r.profile}` === combo,
        );
        if (!run) return "-";
        if (!run.ok) return "error";
        const s = run.scores.find((x) => x.id === cm.id);
        if (!s) return "-";
        if (s.status !== "intact" && s.status !== "partial") return s.status;
        return `${s.status} (${s.hits.some((h) => h.inKept) ? "kept" : "summary"})`;
      });
      out.push(`| ${c.id}/${cm.id} | ${cells.join(" | ")} |`);
    }
  }

  out.push(
    "",
    "## Totals",
    "",
    "| Method | Intact | Partial | Absent | Invalid | Errors |",
    "|---|---|---|---|---|---|",
  );
  for (const combo of combos) {
    const rs = runs.filter((r) => `${r.variant}@${r.profile}` === combo);
    const scores = rs.flatMap((r) => (r.ok ? r.scores : []));
    const n = (st: string) => scores.filter((s) => s.status === st).length;
    out.push(
      `| ${combo} | ${n("intact")} | ${n("partial")} | ${n("absent")} | ${n("invalid")} | ${rs.filter((r) => !r.ok).length} |`,
    );
  }

  out.push(
    "",
    "## Cost (estimated tokens)",
    "",
    "| Method | Compactions | Median context after compaction | Median summary chars | Sent over replay | Peak |",
    "|---|---|---|---|---|---|",
  );
  for (const combo of combos) {
    const ok = runs
      .filter((r) => `${r.variant}@${r.profile}` === combo)
      .flatMap((r) => (r.ok ? [r] : []));
    const comps = ok.flatMap((r) => r.cost.compactions);
    const sent = ok.reduce((a, r) => a + r.cost.sentTokens, 0);
    const peak = Math.max(0, ...ok.map((r) => r.cost.peakTokens));
    out.push(
      `| ${combo} | ${comps.length} | ${fmt(median(comps.map((c) => c.tokensAfter)))} | ${fmt(median(comps.map((c) => c.summaryChars)))} | ${fmt(sent)} | ${fmt(peak)} |`,
    );
  }

  const errors = runs.filter((r) => !r.ok);
  if (errors.length) {
    out.push("", "## Errors", "");
    for (const e of errors)
      if (!e.ok)
        out.push(`- ${e.caseId} ${e.variant}@${e.profile}: ${e.error}`);
  }
  return `${out.join("\n")}\n`;
}

async function main(): Promise<void> {
  const cases: Case[] = [];
  if (values.synthetic) {
    const dir = mkdtempSync(join(tmpdir(), "compaction-synthetic-"));
    const s = generateSyntheticSession(join(dir, "synthetic.jsonl"));
    cases.push({
      id: "synthetic",
      session: s.file,
      commitments: s.commitments,
    });
  }
  if (values.cases) cases.push(...loadCases(resolve(values.cases)));
  if (cases.length === 0)
    throw new Error("nothing to run: pass --cases <file> and/or --synthetic");

  const profiles = pickProfiles(values.profiles);
  const variants = await Promise.all(
    values.variants.split(",").map((v) => loadVariant(v.trim())),
  );
  const runs: CaseRun[] = [];
  for (const c of cases)
    for (const p of profiles)
      for (const v of variants) {
        const run = await runCase(c, v, p);
        runs.push(run);
        process.stderr.write(
          `${c.id} ${v.name}@${p.name}: ${run.ok ? run.scores.map((s) => s.status[0]).join("") : `error: ${run.error}`}\n`,
        );
      }

  const outDir = resolve(
    values.out ??
      join(
        ".pi",
        "evals",
        "compaction",
        "results",
        new Date().toISOString().replace(/[:.]/g, "-"),
      ),
  );
  mkdirSync(outDir, { recursive: true });
  writeFileSync(
    join(outDir, "results.json"),
    `${JSON.stringify({ args: values, runs }, null, "\t")}\n`,
  );
  const md = report(runs, cases);
  writeFileSync(join(outDir, "report.md"), md);
  process.stdout.write(`${md}\nWritten to ${outDir}\n`);
}

await main();
