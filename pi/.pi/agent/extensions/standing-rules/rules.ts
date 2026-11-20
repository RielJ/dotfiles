import type { AgentMessage } from "@earendil-works/pi-agent-core";
import type { SessionEntry } from "@earendil-works/pi-coding-agent";

/**
 * Pull standing rules out of the user's own messages so they survive
 * compaction verbatim. Used live by index.ts and by the compaction eval
 * (evals/compaction), so both measure the same code.
 *
 * The trigger words are generic English for "this binds later work". They were
 * written without looking at the frozen cases and tuned only on a separate,
 * hand-labelled set of other sessions (see tune.ts), so the eval is not tuned
 * to them.
 */

/** Apostrophe, straight or curly. */
const AP = "['\u2019]";

/** Words that mark a statement as a standing constraint or decision. */
const TRIGGERS: RegExp[] = [
  /\bfrom now on\b/i,
  /\bgoing forward\b/i,
  /(?:^|[,;]\s*)moving forward\b/i,
  /\bfor the rest of\b/i,
  /\bnext time\b/i,
  /\balways\b/i,
  /\bnever\b/i,
  // "don't" and "do not", but not "I don't know/see/understand ..." chat.
  new RegExp(
    `\\b(?:don${AP}?t|do not)\\b(?! (?:know|see|understand|think|get|have|remember|mind|really|wish|care)\\b)(?!\\s*[.!?]?\\s*$)`,
    "i",
  ),
  /\bmust\b/i,
  // "X should ...", but not "should we ...", "how we should ..." (asks) or "should've" (hindsight).
  /(?<!\b(?:how|what|why|whether|where|when|which) (?:\w+ )?)\bshould(?:n['\u2019]?t| not)?\b(?! (?:i|we|you|it|this|they)\b)(?!['\u2019]ve| have\b)/i,
  /(?<!\b(?:how|what|why|whether|where|when|which) )\b(?:it|this|that|they|these|those|we|you|everything|each|every \w+) should\b(?!['\u2019]ve| have\b)/i,
  /\b(?:needs?|has|have) to be\b/i,
  /\bavoid\b/i,
  /\bmake s+u?re\b/i,
  /\bmake (?:it such|them such|every|each)\b/i,
  /\binstead(?: of)?\b/i,
  /\brather than\b/i,
  /\bexcept\b/i,
  /\bunless\b/i,
  /\bwithout\b/i,
  /\bnot (?:just|only)\b/i,
  new RegExp(`\\bi(?:${AP}d)? (?:prefer|like|love)\\b`, "i"),
  new RegExp(
    `\\bi (?:want|need|don${AP}?t want|don${AP}?t like|don${AP}?t care)\\b(?! to\\b)(?! you to (?:also )?(?:go|search|look|research|check|find|compile|explain|tell|review|help)\\b)`,
    "i",
  ),
  // "we want/need X", but not "if we need ..." or "the tools we need and ...".
  new RegExp(
    `(?<!\\b(?:if|whether|what|that|which|do|does) )\\bwe(?:${AP}d| would)? (?:want|need|prefer|like to)\\b(?!\\s*(?:and|or|,|\\.|$))`,
    "i",
  ),
  new RegExp(
    `(?<!\\b(?:if|whether|what|that|which|how) )\\bwe(?:${AP}ll| will| should| just| need to)? (?:use|go with|stick|keep|have a)\\b`,
    "i",
  ),
  /\bi (?:also )?want to (?:use|keep|stick|avoid|only|always|never)\b/i,
  /\b(?:can|could) (?:we|you) (?:just |please |also )?(?:use|go with|stick|keep|always|only|never)\b/i,
  /^\W*(?:and |but |btw,? )?not\b/i,
  /\bno more\b/i,
  /\bremember (?:to|that)\b/i,
  /(?<!\bthe )\bonly\b/i,
  new RegExp(`\\blet${AP}?s (?:use|keep|go with|stick|go for|not)\\b`, "i"),
  /\bgo (?:with|for)\b/i,
  /\bstick (?:to|with)\b/i,
  /(?:^\W*|[,;] )(?:please |pls |also |and |btw,? )*(?:use|keep|leave|stop \w+ing|ask|focus|store|put|write) /i,
  /\bcommit (?:by|per|each|every|for every|after|file by file|only)\b/i,
  /\bpriorit(?:y|ize|ise)\b/i,
  /\b(?:our|the) (?:basis|baseline|reference|source of truth|default)\b/i,
  /\boverengineer/i,
];

/** A question that opens like this asks for information, so it is never a rule. */
const INTERROGATIVE =
  /^\W*(?:(?:so|and|but|ok(?:ay)?|also|btw|then|hmm|wait),?\s+)?(?:what|why|how|when|where|which|who|whose|is|are|was|were|do|does|did|should|shall|will|would|have|has|had|am|isn['\u2019]?t|aren['\u2019]?t|don['\u2019]?t|doesn['\u2019]?t|won['\u2019]?t|must i)\b/i;

/** A question that proposes a standing decision: "can we always ...", "maybe we just use X?". */
const PROPOSAL =
  /\b(?:can|could) (?:we|you)\b.*\b(?:make s+u?re|make (?:it|them|every|each)|use|go with|stick|keep|only|always|never|instead|every|each|commit for|commit by)\b|\bshould\b|\bmust\b|\bmaybe we (?:just )?use\b/i;

/** A question built on one of these asks how or why, so it proposes nothing. */
const WH_QUESTION =
  /\b(?:how|why|what|where|which) (?:can|could|do|does|did|should|would|is|are|will)\b|\bdo you think\b/i;

/** A question-marked sentence that still states a want: "I think we'd want X, but maybe Y?". */
const DECLARATIVE =
  /\bwe(?:['\u2019]d| would)? (?:want|need|prefer)\b|\bi (?:want|prefer|need)\b|\bdon['\u2019]?t\b|\balways\b|\bnever\b/i;

/** A sentence that starts with one of these qualifies the one before it. */
const QUALIFIER =
  /^(?:because|since|unless|except|but|only|so that|as long as|instead)\b/i;

/** Longer sentences are cut to a window around the trigger instead of dropped. */
const MAX_SENTENCE_CHARS = 300;
/** Context kept before the trigger when a long sentence is cut. */
const LEAD_CHARS = 80;
/** Fragments shorter than this are headings or stray words, not rules. */
const MIN_RULE_CHARS = 12;

/** Lines that look like pasted code, config, logs or paths rather than prose. */
function looksLikeCode(line: string): boolean {
  const t = line.trim();
  if (t.length === 0) return true;
  if (/^[{}[\]()<>#/|$`│]|^```|^\s{2,}\S/.test(line)) return true;
  if (/[{};]\s*$/.test(t)) return true;
  if (/^"[^"]+":/.test(t)) return true;
  // Log lines: "Error: ...", "Warning: ...", "at fn (file:1:2)", "[tag] ...".
  if (/^(?:\w*error|warn(?:ing)?|info|debug|fatal|trace)\b\s*[:[]/i.test(t))
    return true;
  if (/^at\s+\S+\s*\(?\S*:\d+/.test(t)) return true;
  return false;
}

/** A message this long, over this many lines, is mostly pasted text (an email, a job post, a spec). */
const PASTE_MIN_CHARS = 700;
const PASTE_MIN_LINES = 10;

/**
 * From a pasted document keep only the user's own lead-in and closing
 * paragraph; the rules inside a pasted email or assignment are not the user's.
 */
function ownWords(text: string): string {
  const lines = text.split("\n").filter((l) => l.trim()).length;
  if (text.length < PASTE_MIN_CHARS || lines < PASTE_MIN_LINES) return text;
  const paras = text
    .trim()
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean);
  if (paras.length >= 2) return `${paras[0]}\n${paras.at(-1)}`;
  const all = text.trim().split("\n");
  return `${all[0]}\n${all.at(-1)}`;
}

/** Messages the user did not type: expanded skills, prompt templates, injected notes. */
/** Text Pi or an extension wrote into a user message, not the user's own words. */
const INJECTED = [
  /^\s*<(?:skill|memory|system|command)/i,
  // git-workflow's /commit prompt template.
  /^\s*Inspect and commit current changes\./,
];

function isInjected(text: string): boolean {
  return INJECTED.some((re) => re.test(text));
}

/** Plain text of a user message. */
export function userText(message: AgentMessage): string {
  if (message.role !== "user") return "";
  if (typeof message.content === "string") return message.content;
  return message.content
    .map((b) => (b.type === "text" ? b.text : ""))
    .join("\n");
}

function splitSentences(text: string): string[] {
  const out: string[] = [];
  for (const line of text.split(/\n+/)) {
    if (looksLikeCode(line)) continue;
    for (const s of line.trim().split(/(?<=[.!?])\s+/)) {
      const t = s.trim();
      if (t) out.push(t);
    }
  }
  return out;
}

/** First trigger match in a sentence, or undefined. */
function firstTrigger(s: string): RegExpExecArray | undefined {
  let best: RegExpExecArray | undefined;
  for (const re of TRIGGERS) {
    const m = re.exec(s);
    if (m && (!best || m.index < best.index)) best = m;
  }
  return best;
}

function isRuleSentence(s: string): RegExpExecArray | undefined {
  if (s.length < MIN_RULE_CHARS) return undefined;
  if (s.endsWith(":")) return undefined;
  if (s.endsWith("?")) {
    if (INTERROGATIVE.test(s) || WH_QUESTION.test(s)) return undefined;
    const asks = /^\W*(?:\w+,?\s+)?(?:can|could) (?:you|we)\b/i.test(s);
    if (!PROPOSAL.test(s) && (asks || !DECLARATIVE.test(s))) return undefined;
  }
  const m = firstTrigger(s);
  if (!m) return undefined;
  // A sentence that is only the trigger word ("instead of") carries no rule.
  if (s.replace(m[0], "").replace(/\W+/g, "").length < 3) return undefined;
  return m;
}

/** Cut a long sentence to a window that starts a little before the trigger. */
function trim(s: string, at: number): string {
  if (s.length <= MAX_SENTENCE_CHARS) return s;
  let start = Math.max(0, at - LEAD_CHARS);
  if (start > 0) {
    const space = s.indexOf(" ", start);
    start = space >= 0 && space < at ? space + 1 : start;
  }
  let end = Math.min(s.length, start + MAX_SENTENCE_CHARS);
  if (end < s.length) {
    const space = s.lastIndexOf(" ", end);
    end = space > at ? space : end;
  }
  return `${start > 0 ? "…" : ""}${s.slice(start, end).trim()}${end < s.length ? "…" : ""}`;
}

/**
 * Every prose sentence of a user message (code, config and log lines dropped;
 * pasted documents kept). The input a model-based classifier picks from.
 */
export function candidateSentences(text: string): string[] {
  if (isInjected(text)) return [];
  return splitSentences(text).filter((s) => s.length >= MIN_RULE_CHARS);
}

/** Standing-rule sentences from one user message, each with its qualifier attached. */
export function extractRules(text: string): string[] {
  if (isInjected(text)) return [];
  const sentences = splitSentences(ownWords(text));
  const rules: string[] = [];
  for (let i = 0; i < sentences.length; i++) {
    const s = sentences[i];
    const m = isRuleSentence(s);
    if (!m) continue;
    let rule = trim(s, m.index);
    const next = sentences[i + 1];
    if (next && QUALIFIER.test(next) && !next.endsWith("?")) {
      rule = `${rule} ${trim(next, 0)}`;
      i++;
    }
    rules.push(rule);
  }
  return rules;
}

export interface RulesSection {
  text: string;
  kept: number;
  found: number;
}

/**
 * Rules from every user message on the branch, deduplicated. When they exceed
 * `budgetChars`, the newest win, since a later rule usually supersedes an older one.
 */
export function rulesSection(
  entries: SessionEntry[],
  budgetChars: number,
): RulesSection {
  const seen = new Set<string>();
  const all: string[] = [];
  for (const e of entries) {
    if (e.type !== "message" || e.message.role !== "user") continue;
    for (const r of extractRules(userText(e.message))) {
      const k = r.toLowerCase().replace(/\s+/g, " ");
      if (seen.has(k)) continue;
      seen.add(k);
      all.push(r);
    }
  }
  const kept: string[] = [];
  let used = 0;
  for (let i = all.length - 1; i >= 0; i--) {
    const line = `- ${all[i]}\n`;
    if (used + line.length > budgetChars) break;
    kept.unshift(line);
    used += line.length;
  }
  if (kept.length === 0) return { text: "", kept: 0, found: all.length };
  return {
    text: `\n\n## Standing rules (user's words, verbatim)\n${kept.join("")}`,
    kept: kept.length,
    found: all.length,
  };
}
