import { parseArgs } from "node:util";
import { normalize } from "./score.ts";
import { entryText, loadReplayEntries } from "./session.ts";

/**
 * List user messages that look like rules, so a person can pick commitments.
 * Output holds private session text: redirect it under .pi/ (ignored by git).
 *
 *   node evals/compaction/mine.ts --session <file.jsonl> [--after 0.1] [--before 0.7]
 */

const RULE =
  /\b(don't|do not|never|always|must|only|instead of|rather than|except|unless|avoid|stop|keep|prefer|make sure|from now on|going forward|no need|should not|shouldn't)\b/i;

const { values } = parseArgs({
  options: {
    session: { type: "string" },
    after: { type: "string", default: "0.05" },
    before: { type: "string", default: "0.8" },
    max: { type: "string", default: "400" },
  },
});
if (!values.session) throw new Error("--session <file> is required");

const entries = loadReplayEntries(values.session);
const source = normalize(entries.map(entryText).join("\n"));
const after = Number(values.after);
const before = Number(values.before);
const max = Number(values.max);

for (let i = 0; i < entries.length; i++) {
  const e = entries[i];
  if (e.kind !== "message" || e.message.role !== "user") continue;
  const pos = i / entries.length;
  if (pos < after || pos > before) continue;
  const text = normalize(entryText(e));
  if (!RULE.test(text) || text.startsWith("[pi-lens") || text.length > 3000)
    continue;
  process.stdout.write(
    `\n#${i} pos=${pos.toFixed(2)} id=${e.id}\n${text.slice(0, max)}${text.length > max ? " …" : ""}\n`,
  );
}
process.stdout.write(`\n${entries.length} entries, ${source.length} chars\n`);
