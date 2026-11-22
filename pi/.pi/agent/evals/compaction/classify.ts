/**
 * Model-based standing-rule classifier, compared with the regex extractor
 * (`extractRules`) on the hand-labelled tuning sentences.
 *
 * The model sees every candidate sentence of each labelled user message,
 * numbered, in session order, and returns sentence ids only. The selected
 * sentences are used verbatim, so the model cannot invent or reword a rule.
 *
 *   node evals/compaction/classify.ts train          # sanity check
 *   node evals/compaction/classify.ts dev            # report once
 *   node evals/compaction/classify.ts dev --errors   # list misses after the report
 *
 * Model answers are cached (git-ignored) by a hash of the prompt, so re-runs
 * are free and deterministic. Labels and cache live under
 * .pi/evals/compaction/tuning/; nothing here embeds session text.
 */
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";

import {
  candidateSentences,
  extractRules,
} from "../../extensions/standing-rules/rules.ts";

const MODEL = "anthropic/claude-haiku-5-5";
const DIR = ".pi/evals/compaction/tuning";
const CACHE_FILE = `${DIR}/classifier-cache.json`;
const BATCH_MESSAGES = 10;
const BATCH_CHARS = 12_000;
const CONCURRENCY = 4;

interface Item {
  msg: number;
  session: string;
  text: string;
  rule: boolean;
  split: "train" | "dev";
}

interface Labels {
  messages: Record<string, { text: string }>;
  items: Item[];
}

interface Message {
  msg: number;
  sentences: string[];
}

const INSTRUCTIONS = `Below are messages a user typed to an AI coding agent during one working session, in order. Each sentence has an id such as m3.s2 (message 3, sentence 2).

Select every sentence that sets a STANDING RULE: an instruction or decision that should keep binding the agent's later work in this session, not only the current step. A standing rule is either
- a constraint: something required, forbidden or explicitly allowed from now on (a convention, a style, a tool or library to use or avoid, a limit, a priority), or
- a decision: an agreed choice between options, or a convention the user settles on.

Users often state rules casually, for example: "can we keep the API responses in snake_case?", "I'd rather not pull in another dependency", "the sidebar should stay collapsed by default", "no mocks, hit the real database", "go with the second approach".

Requirements on how something must look or behave also count ("X should ...", "must be ...", "only ...", "I don't like X"), even when they arise while working on the current task, because the agent has to keep honouring them later. When unsure, select the sentence: a missed rule costs more than an extra one.

Also list, as qualifiers, sentences that only add the condition, reason or exception of a rule you selected (because / unless / except / only when).

Do NOT select: one-off requests about the current task ("fix this error", "run the tests again"), questions asking for information or an opinion, status updates, thanks, feedback on a single result, or text the user pasted from elsewhere (emails, job posts, specs, documentation, logs, code).

Answer with JSON only, no prose: {"rules":["m3.s2"],"qualifiers":["m3.s3"]}. Use empty lists when nothing qualifies.`;

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

/** Same matching rule as tune.ts: one string contains the other. */
function isExtracted(sentence: string, picked: string[]): boolean {
  const s = norm(sentence);
  return picked.some((r) => {
    const n = norm(r);
    return n.includes(s) || (n.length >= MIN_PARTIAL && s.includes(n));
  });
}

function batches(messages: Message[]): Message[][] {
  const result: Message[][] = [];
  let current: Message[] = [];
  let chars = 0;
  for (const m of messages) {
    const size = m.sentences.join(" ").length;
    if (
      current.length > 0 &&
      (current.length >= BATCH_MESSAGES || chars + size > BATCH_CHARS)
    ) {
      result.push(current);
      current = [];
      chars = 0;
    }
    current.push(m);
    chars += size;
  }
  if (current.length > 0) result.push(current);
  return result;
}

function render(batch: Message[]): string {
  const blocks = batch.map((m, mi) => {
    const lines = m.sentences.map((s, si) => `m${mi + 1}.s${si + 1}: ${s}`);
    return `[message m${mi + 1}]\n${lines.join("\n")}`;
  });
  return `${INSTRUCTIONS}\n\n${blocks.join("\n\n")}`;
}

function runModel(prompt: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(
      "pi",
      [
        "-p",
        "--model",
        MODEL,
        "--thinking",
        "off",
        "--no-session",
        "--no-tools",
        "--no-extensions",
        "--no-skills",
        "--no-context-files",
        "--system-prompt",
        "You classify sentences and answer with JSON only.",
      ],
      { stdio: ["pipe", "pipe", "pipe"] },
    );
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (d) => {
      stdout += d;
    });
    child.stderr.on("data", (d) => {
      stderr += d;
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) resolve(stdout);
      else reject(new Error(`pi exited ${code}: ${stderr.slice(0, 300)}`));
    });
    child.stdin.end(prompt);
  });
}

function parseIds(raw: string): string[] {
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start < 0 || end < start)
    throw new Error(`no JSON in: ${raw.slice(0, 200)}`);
  const parsed: unknown = JSON.parse(raw.slice(start, end + 1));
  if (typeof parsed !== "object" || parsed === null) return [];
  const answer: { rules?: unknown; qualifiers?: unknown } = parsed;
  const ids: string[] = [];
  for (const list of [answer.rules, answer.qualifiers]) {
    if (!Array.isArray(list)) continue;
    for (const id of list) if (typeof id === "string") ids.push(id);
  }
  return ids;
}

type Cache = Record<string, string>;

function loadCache(): Cache {
  if (!existsSync(CACHE_FILE)) return {};
  const parsed: unknown = JSON.parse(readFileSync(CACHE_FILE, "utf8"));
  if (typeof parsed !== "object" || parsed === null) return {};
  const cache: Cache = {};
  for (const [k, v] of Object.entries(parsed))
    if (typeof v === "string") cache[k] = v;
  return cache;
}

async function classify(
  messages: Message[],
  cache: Cache,
): Promise<{ picked: Map<number, string[]>; calls: number; failed: number }> {
  const picked = new Map<number, string[]>();
  const work = batches(messages);
  let calls = 0;
  let failed = 0;
  let next = 0;
  const worker = async (): Promise<void> => {
    while (next < work.length) {
      const batch = work[next++];
      const prompt = render(batch);
      const key = createHash("sha256")
        .update(`${MODEL}\n${prompt}`)
        .digest("hex");
      let raw = cache[key];
      try {
        if (raw === undefined) {
          raw = await runModel(prompt);
          calls++;
          cache[key] = raw;
        }
        for (const id of parseIds(raw)) {
          const m = /^m(\d+)\.s(\d+)$/.exec(id.trim());
          if (!m) continue;
          const message = batch[Number(m[1]) - 1];
          const sentence = message?.sentences[Number(m[2]) - 1];
          if (!message || sentence === undefined) continue;
          const list = picked.get(message.msg) ?? [];
          list.push(sentence);
          picked.set(message.msg, list);
        }
      } catch (error) {
        failed++;
        process.stderr.write(`batch failed: ${String(error)}\n`);
      }
    }
  };
  await Promise.all(Array.from({ length: CONCURRENCY }, worker));
  return { picked, calls, failed };
}

interface Score {
  tp: number;
  fp: Item[];
  fn: Item[];
}

function score(items: Item[], pickedFor: (msg: number) => string[]): Score {
  const result: Score = { tp: 0, fp: [], fn: [] };
  for (const item of items) {
    const got = isExtracted(item.text, pickedFor(item.msg));
    if (got && item.rule) result.tp++;
    else if (got) result.fp.push(item);
    else if (item.rule) result.fn.push(item);
  }
  return result;
}

function line(name: string, s: Score, chars: number): string {
  const precision = s.tp / (s.tp + s.fp.length || 1);
  const recall = s.tp / (s.tp + s.fn.length || 1);
  const f1 = (2 * precision * recall) / (precision + recall || 1);
  return `| ${name} | ${s.tp} | ${s.fp.length} | ${s.fn.length} | ${precision.toFixed(3)} | ${recall.toFixed(3)} | ${f1.toFixed(3)} | ${chars} |`;
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const split = args.find((a) => a === "train" || a === "dev") ?? "train";
  const labels: Labels = JSON.parse(readFileSync(`${DIR}/labels.json`, "utf8"));
  const items = labels.items.filter((i) => i.split === split);

  // Labelled messages, grouped by session and kept in session order.
  const order = [...new Set(items.map((i) => i.msg))].sort((a, b) => a - b);
  const bySession = new Map<string, Message[]>();
  for (const msg of order) {
    const session = items.find((i) => i.msg === msg)?.session ?? "";
    const text = labels.messages[String(msg)]?.text ?? "";
    const list = bySession.get(session) ?? [];
    list.push({ msg, sentences: candidateSentences(text) });
    bySession.set(session, list);
  }

  const cache = loadCache();
  const picked = new Map<number, string[]>();
  let calls = 0;
  let failed = 0;
  for (const messages of bySession.values()) {
    const r = await classify(messages, cache);
    for (const [k, v] of r.picked) picked.set(k, v);
    calls += r.calls;
    failed += r.failed;
  }
  writeFileSync(CACHE_FILE, JSON.stringify(cache, null, 2));

  const regex = new Map<number, string[]>();
  const all = new Map<number, string[]>();
  for (const msg of order) {
    const text = labels.messages[String(msg)]?.text ?? "";
    regex.set(msg, extractRules(text));
    all.set(msg, candidateSentences(text));
  }
  const get = (m: Map<number, string[]>) => (msg: number) => m.get(msg) ?? [];
  const union = (msg: number) => [...get(regex)(msg), ...get(picked)(msg)];
  const chars = (f: (msg: number) => string[]) =>
    order.reduce((n, msg) => n + f(msg).join(" ").length, 0);

  const positives = items.filter((i) => i.rule).length;
  out(
    `${split}: n=${items.length} rules=${positives} messages=${order.length} model calls=${calls} failed batches=${failed}`,
  );
  out("| Method | TP | FP | FN | Precision | Recall | F1 | Extracted chars |");
  out("|---|---|---|---|---|---|---|---|");
  const methods: [string, (msg: number) => string[]][] = [
    ["regex", get(regex)],
    ["classifier", get(picked)],
    ["regex ∪ classifier", union],
    ["all sentences (ceiling)", get(all)],
  ];
  const scores = methods.map(
    ([name, f]) => [name, score(items, f), f] as const,
  );
  for (const [name, s, f] of scores) out(line(name, s, chars(f)));

  if (args.includes("--errors")) {
    const s = scores[1][1];
    out(`\n--- classifier false positives (${s.fp.length})`);
    for (const i of s.fp) out(`[${i.msg}] ${i.text.slice(0, 200)}`);
    out(`\n--- classifier false negatives (${s.fn.length})`);
    for (const i of s.fn) out(`[${i.msg}] ${i.text.slice(0, 200)}`);
  }
}

await main();
