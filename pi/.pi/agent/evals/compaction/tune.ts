/**
 * Tuning report for the standing-rule extractor (`extractRules` in rules.ts).
 *
 * Reads hand labels from a git-ignored file (default
 * `.pi/evals/compaction/tuning/labels.json`) and prints precision, recall and
 * the false positives/negatives for one split. Session text lives only in that
 * ignored file and on stdout; nothing here embeds it.
 *
 *   node evals/compaction/tune.ts train            # tune on this
 *   node evals/compaction/tune.ts dev              # report once at the end
 *   node evals/compaction/tune.ts train --quiet    # numbers only
 *   node evals/compaction/tune.ts --sizes          # extracted chars per session
 *
 * Labels file shape:
 *   { sessions: string[]  // paths relative to ~/.pi/agent/sessions
 *     messages: { [msg]: { text: string } }
 *     items: { msg: number; text: string; rule: boolean; split: "train" | "dev" }[] }
 * Each item is one sentence of a user message. A sentence counts as extracted
 * when an extracted rule from its message contains it, or it contains an
 * extracted rule (a trimmed long sentence).
 */
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

import {
  parseSessionEntries,
  type SessionEntry,
} from "@earendil-works/pi-coding-agent";

import {
  extractRules,
  rulesSection,
} from "../../extensions/standing-rules/rules.ts";
import { activeBranch } from "./session.ts";

interface Item {
  msg: number;
  text: string;
  rule: boolean;
  split: "train" | "dev";
}

interface Labels {
  sessions: string[];
  messages: Record<string, { text: string }>;
  items: Item[];
}

function out(line: string): void {
  process.stdout.write(`${line}\n`);
}

function norm(text: string): string {
  return text
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/…/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

const MIN_PARTIAL = 20;

function isExtracted(sentence: string, rules: string[]): boolean {
  const s = norm(sentence);
  return rules.some((r) => {
    const n = norm(r);
    return n.includes(s) || (n.length >= MIN_PARTIAL && s.includes(n));
  });
}

function evaluate(labels: Labels, split: string, quiet: boolean): void {
  const items = labels.items.filter(
    (i) => split === "all" || i.split === split,
  );
  const cache = new Map<number, string[]>();
  const rulesFor = (msg: number): string[] => {
    let r = cache.get(msg);
    if (!r) {
      r = extractRules(labels.messages[String(msg)]?.text ?? "").map(norm);
      cache.set(msg, r);
    }
    return r;
  };
  const fp: Item[] = [];
  const fn: Item[] = [];
  let tp = 0;
  for (const item of items) {
    const got = isExtracted(item.text, rulesFor(item.msg));
    if (got && item.rule) tp++;
    else if (got) fp.push(item);
    else if (item.rule) fn.push(item);
  }
  const precision = tp / (tp + fp.length || 1);
  const recall = tp / (tp + fn.length || 1);
  const f1 = (2 * precision * recall) / (precision + recall || 1);
  const positives = items.filter((i) => i.rule).length;
  out(
    `${split}: n=${items.length} rules=${positives} tp=${tp} fp=${fp.length} fn=${fn.length} ` +
      `precision=${precision.toFixed(3)} recall=${recall.toFixed(3)} f1=${f1.toFixed(3)}`,
  );
  if (quiet) return;
  const show = (label: string, list: Item[]) => {
    out(`\n--- ${label} (${list.length})`);
    for (const i of list) out(`[${i.msg}] ${i.text.slice(0, 240)}`);
  };
  show("false positives", fp);
  show("false negatives", fn);
}

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = Math.min(sorted.length - 1, Math.ceil(p * sorted.length) - 1);
  return sorted[Math.max(0, idx)];
}

function sizes(labels: Labels): void {
  const root = join(homedir(), ".pi", "agent", "sessions");
  const chars: number[] = [];
  for (const rel of labels.sessions) {
    const raw = readFileSync(join(root, rel), "utf8");
    const entries = parseSessionEntries(raw).filter(
      (e): e is SessionEntry =>
        typeof e === "object" && e !== null && "id" in e && "parentId" in e,
    );
    const section = rulesSection(
      activeBranch(entries),
      Number.MAX_SAFE_INTEGER,
    );
    chars.push(section.text.length);
    out(
      `${rel.split("/")[0]}: rules=${section.found} chars=${section.text.length}`,
    );
  }
  const sorted = [...chars].sort((a, b) => a - b);
  out(
    `sessions=${sorted.length} median=${percentile(sorted, 0.5)} p90=${percentile(sorted, 0.9)} max=${sorted.at(-1) ?? 0}`,
  );
}

function main(): void {
  const args = process.argv.slice(2);
  const flag = (name: string) => args.includes(name);
  const labelsIdx = args.indexOf("--labels");
  const file =
    labelsIdx >= 0
      ? args[labelsIdx + 1]
      : ".pi/evals/compaction/tuning/labels.json";
  const labels: Labels = JSON.parse(readFileSync(file, "utf8"));
  if (flag("--sizes")) {
    sizes(labels);
    return;
  }
  const split =
    args.find((a) => a === "train" || a === "dev" || a === "all") ?? "train";
  evaluate(labels, split, flag("--quiet"));
}

main();
