/**
 * Loader for damage-control-rules.yaml. The file uses a small, fixed subset of YAML:
 *
 *   bashToolPatterns:
 *     - pattern: '<JS regex, single-quoted, '' escapes a quote>'
 *       reason: <text>
 *       hard: true        # optional: refuse without asking
 *       ask: true         # optional, accepted for compatibility (every rule asks)
 *   zeroAccessPaths: / readOnlyPaths: / noDeletePaths:
 *     - "<path pattern>"  # quoted or bare
 *
 * Anything else is an error, so a typo can't silently disable a rule.
 */

export type BashRule = { pattern: RegExp; source: string; reason: string; hard: boolean };

export type Rules = {
  bash: BashRule[];
  zeroAccess: string[];
  readOnly: string[];
  noDelete: string[];
};

type Section = "bashToolPatterns" | "zeroAccessPaths" | "readOnlyPaths" | "noDeletePaths";
const SECTIONS = new Set<string>(["bashToolPatterns", "zeroAccessPaths", "readOnlyPaths", "noDeletePaths"]);

function scalar(raw: string, line: number): string {
  const v = raw.trim();
  if (v.startsWith("'")) {
    if (!v.endsWith("'") || v.length < 2) throw new Error(`line ${line}: unterminated '-quoted value`);
    return v.slice(1, -1).replaceAll("''", "'");
  }
  if (v.startsWith('"')) {
    if (!v.endsWith('"') || v.length < 2) throw new Error(`line ${line}: unterminated "-quoted value`);
    return v.slice(1, -1).replace(/\\(["\\])/g, "$1");
  }
  return v;
}

function bool(raw: string, line: number): boolean {
  const v = raw.trim();
  if (v === "true") return true;
  if (v === "false") return false;
  throw new Error(`line ${line}: expected true or false, got ${v}`);
}

export function parseRules(text: string): Rules {
  const rules: Rules = { bash: [], zeroAccess: [], readOnly: [], noDelete: [] };
  let section: Section | undefined;
  let rule: { source?: string; reason?: string; hard: boolean; line: number } | undefined;

  const finishRule = () => {
    if (!rule) return;
    if (rule.source === undefined || rule.reason === undefined) {
      throw new Error(`line ${rule.line}: bash rule needs both pattern and reason`);
    }
    let pattern: RegExp;
    try {
      pattern = new RegExp(rule.source);
    } catch (error) {
      throw new Error(`line ${rule.line}: invalid regex ${rule.source}: ${(error as Error).message}`);
    }
    rules.bash.push({ pattern, source: rule.source, reason: rule.reason, hard: rule.hard });
    rule = undefined;
  };

  const lines = text.split("\n");
  for (let i = 0; i < lines.length; i++) {
    const n = i + 1;
    const line = lines[i].replace(/\s+$/, "");
    if (!line.trim() || line.trimStart().startsWith("#")) continue;

    const top = line.match(/^([A-Za-z]+):$/);
    if (top) {
      finishRule();
      if (!SECTIONS.has(top[1])) throw new Error(`line ${n}: unknown section ${top[1]}`);
      section = top[1] as Section;
      continue;
    }
    if (!section) throw new Error(`line ${n}: content before any section`);

    if (section === "bashToolPatterns") {
      const item = line.match(/^\s*-\s+([a-z]+):\s*(.*)$/);
      const field = item ?? line.match(/^\s+([a-z]+):\s*(.*)$/);
      if (!field) throw new Error(`line ${n}: expected "key: value"`);
      if (item) {
        finishRule();
        rule = { hard: false, line: n };
      }
      if (!rule) throw new Error(`line ${n}: field outside a "- pattern:" item`);
      const [, key, value] = field;
      if (key === "pattern") rule.source = scalar(value, n);
      else if (key === "reason") rule.reason = scalar(value, n);
      else if (key === "hard") rule.hard = bool(value, n);
      else if (key === "ask") bool(value, n);
      else throw new Error(`line ${n}: unknown key ${key}`);
      continue;
    }

    const item = line.match(/^\s*-\s+(.+)$/);
    if (!item) throw new Error(`line ${n}: expected "- <path>"`);
    const value = scalar(item[1], n);
    if (section === "zeroAccessPaths") rules.zeroAccess.push(value);
    else if (section === "readOnlyPaths") rules.readOnly.push(value);
    else rules.noDelete.push(value);
  }
  finishRule();
  return rules;
}
