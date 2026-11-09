import { absolutePath, firstMatch, isTempPath, type PathEnv } from "./paths.ts";
import type { Rules } from "./rules.ts";
import { commandName, commandWords, simpleCommands } from "./shell.ts";

export type Finding = { reason: string; hard: boolean };

export type Decision =
  | { action: "allow" }
  | { action: "ask"; reasons: string[] }
  | { action: "block"; reasons: string[] };

const SAFE_KILL =
  "List the processes with `pgrep -fl 'pattern'` (options before the pattern), check the list, then `kill` the exact PIDs.";

/** Options of BSD pkill/pgrep that take a value as the next word. */
const KILL_VALUE_OPTIONS = new Set(["-F", "-G", "-g", "-J", "-M", "-N", "-P", "-s", "-t", "-U", "-u", "-c"]);

/**
 * pkill/pgrep. BSD versions (macOS) stop parsing options at the first pattern, so
 * `pkill -f "x" -U 501` treats `-U` and `501` as extra regexes. On 2026-11-09 that matched
 * every pi subagent (argv holds `--session …/--Users-…`) and ~30 apps. Never intended: hard.
 */
function checkKill(name: string, args: string[]): Finding[] {
  let sawPattern = false;
  let fullArgv = false;
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === "--") break;
    const isOption = a.startsWith("-") && a.length > 1;
    if (!sawPattern && isOption) {
      if (/^-[^-]*f/.test(a)) fullArgv = true;
      if (KILL_VALUE_OPTIONS.has(a)) i++;
      continue;
    }
    if (!sawPattern) {
      sawPattern = true;
      continue;
    }
    if (isOption) {
      return [
        {
          hard: true,
          reason: `\`${name}\`: option \`${a}\` comes after the pattern. macOS (BSD) ${name} stops parsing options at the first pattern, so \`${a}\` and its value become extra regexes that match unrelated processes (this once killed every pi subagent). Put all options before the pattern.${name === "pkill" ? ` ${SAFE_KILL}` : ""}`,
        },
      ];
    }
  }
  if (name === "pkill" && fullArgv) {
    return [
      {
        hard: false,
        reason: `\`pkill -f\` matches the full command line of every process you own, including pi agents and apps, and kills them without showing what matched. ${SAFE_KILL}`,
      },
    ];
  }
  return [];
}

function operands(args: string[]): string[] {
  const out: string[] = [];
  let optionsDone = false;
  for (const a of args) {
    if (!optionsDone && a === "--") {
      optionsDone = true;
      continue;
    }
    if (!optionsDone && a.startsWith("-") && a.length > 1) continue;
    out.push(a);
  }
  return out;
}

/** Redirection targets in a simple command: `> f`, `>>f`, `2>f`, `&>f`. Fd duplications are skipped. */
function redirectTargets(words: string[]): string[] {
  const out: string[] = [];
  for (let i = 0; i < words.length; i++) {
    const m = words[i].match(/^(?:\d*|&)>>?\|?(.*)$/);
    if (!m) continue;
    const target = m[1] || words[i + 1];
    if (target && !target.startsWith("&")) out.push(target);
  }
  return out;
}

/** Input redirection sources: `< f`, `0<f`. Heredocs (`<<`), here-strings and `<(` are skipped. */
function inputRedirects(words: string[]): string[] {
  const out: string[] = [];
  for (let i = 0; i < words.length; i++) {
    const m = words[i].match(/^\d*<([^<(&].*)?$/);
    if (!m) continue;
    const source = m[1] || words[i + 1];
    if (source) out.push(source);
  }
  return out;
}

/** Commands whose file arguments are read, copied, sent, changed or deleted. */
const SECRET_ARG_COMMANDS = new Set([
  "rm", "shred", "truncate", "tee", "chmod", "chown", "ln", "install",
  "cat", "tac", "less", "more", "head", "tail", "bat", "nl", "source", ".", "cp", "mv", "scp",
  "rsync", "tar", "zip", "base64", "xxd", "od", "hexdump", "strings", "open", "diff", "cmp",
  "sort", "uniq", "wc", "cut", "sed", "awk", "grep", "egrep", "rg", "ag", "jq", "yq", "vim",
  "nvim", "nano", "code", "envsubst", "gpg", "dotenv",
]);
/** Of those, the ones whose first operand is a pattern or script, not a file. */
const PATTERN_FIRST = new Set(["sed", "awk", "grep", "egrep", "rg", "ag", "jq", "yq"]);

/**
 * Variables assigned a literal value or `$(mktemp …)` in this command, so `R=/tmp/x; rm -rf $R`
 * resolves. A variable assigned twice to different values, or to anything else, stays unknown.
 */
export function knownVariables(command: string, env: PathEnv): Map<string, string> {
  const vars = new Map<string, string>();
  const unknown = new Set<string>();
  const tempDir = `${env.tempRoots[0] ?? "/tmp"}/mktemp.XXXXXX`;
  const re = /(?:^|[\s;&|(])([A-Za-z_][A-Za-z0-9_]*)=(\$\(mktemp\b[^)]*\)|"[^"]*"|'[^']*'|[^\s;&|()]*)/g;
  for (const m of command.matchAll(re)) {
    const [, name, raw] = m;
    let value: string | undefined;
    if (raw.startsWith("$(mktemp")) {
      const template = raw.slice(2, -1).split(/\s+/).slice(1).find((w) => !w.startsWith("-"));
      const dir = template && absolutePath(template, env);
      value = !template || (dir && isTempPath(dir, env)) ? tempDir : undefined;
    } else {
      const literal = raw.startsWith("'") ? raw.slice(1, -1) : raw.replace(/^"|"$/g, "");
      const expanded = raw.startsWith("'")
        ? literal
        : literal.replace(/\$\{?([A-Za-z_][A-Za-z0-9_]*)\}?/g, (s, n: string) => vars.get(n) ?? s);
      value = /[$`]/.test(expanded) || expanded === "" ? undefined : expanded;
    }
    if (value === undefined || (vars.has(name) && vars.get(name) !== value)) {
      unknown.add(name);
      vars.delete(name);
    } else if (!unknown.has(name)) vars.set(name, value);
  }
  return vars;
}

const WRITE_TOOLS = new Set(["write", "edit", "Write", "Edit", "MultiEdit", "apply_patch"]);
const PATH_KEYS = ["path", "file", "filePath", "file_path", "paths"];

export class Evaluator {
  private readonly rules: Rules;
  private readonly env: PathEnv;

  constructor(rules: Rules, env: PathEnv) {
    this.rules = rules;
    this.env = env;
  }

  /** Shell variables with a known value in the bash command being evaluated. */
  private vars = new Map<string, string>();

  evaluate(toolName: string, input: unknown): Decision {
    this.vars = new Map();
    const findings =
      toolName === "bash" || toolName === "bash_bg"
        ? this.bash(typeof input === "object" && input && "command" in input ? String(input.command) : "")
        : this.toolPaths(toolName, input);
    return decide(findings);
  }

  /** absolutePath after substituting variables whose value is known. */
  private resolve(raw: string, cwd: string): string | undefined {
    const word = raw.replace(/\$\{?([A-Za-z_][A-Za-z0-9_]*)\}?/g, (m, name: string) => this.vars.get(name) ?? m);
    return absolutePath(word, this.env, cwd);
  }

  private secret(raw: string, cwd: string): Finding | undefined {
    const abs = this.resolve(raw, cwd);
    const hit = abs && firstMatch(this.rules.zeroAccess, abs, this.env);
    return hit ? { hard: false, reason: `Touches a secret path: ${raw} (rule "${hit}")` } : undefined;
  }

  private readOnly(raw: string, cwd: string): Finding | undefined {
    const abs = this.resolve(raw, cwd);
    const hit = abs && firstMatch(this.rules.readOnly, abs, this.env);
    return hit ? { hard: false, reason: `Writes a read-only path: ${raw} (rule "${hit}")` } : undefined;
  }

  private noDelete(raw: string, cwd: string): Finding | undefined {
    const abs = this.resolve(raw, cwd);
    const hit = abs && firstMatch(this.rules.noDelete, abs, this.env);
    return hit ? { hard: false, reason: `Deletes or moves a protected path: ${raw} (rule "${hit}")` } : undefined;
  }

  /** Recursive delete: fine inside temp folders, ask anywhere else or when a target can't be resolved. */
  private recursiveDelete(what: string, targets: string[], cwd: string): Finding[] {
    const unresolved = targets.filter((t) => this.resolve(t, cwd) === undefined);
    if (unresolved.length) {
      return [
        {
          hard: false,
          reason: `${what} with a target built from a variable or substitution (${unresolved.join(", ")}). An empty or unexpected value can delete far more than intended.`,
        },
      ];
    }
    const outside = targets.filter((t) => !isTempPath(this.resolve(t, cwd) ?? "/", this.env));
    return outside.length
      ? [{ hard: false, reason: `${what} outside temp folders: ${outside.join(", ")}` }]
      : [];
  }

  private bash(command: string): Finding[] {
    const findings: Finding[] = [];
    for (const rule of this.rules.bash) {
      if (rule.pattern.test(command)) findings.push({ hard: rule.hard, reason: rule.reason });
    }

    this.vars = knownVariables(command, this.env);
    let cwd = this.env.cwd;
    for (const words of simpleCommands(command)) {
      const [first, ...args] = commandWords(words);
      const name = commandName(first);
      if (!name) continue;
      const ops = operands(args);

      if (name === "cd") {
        const next = ops[0] === undefined ? this.env.home : this.resolve(ops[0], cwd);
        // `cd -` or `cd $X`: unknown directory, so relative paths can't count as temp.
        cwd = next ?? "/nonexistent-unknown-cwd";
      }
      if (name === "pkill" || name === "pgrep") findings.push(...checkKill(name, args));

      if (name === "rm") {
        const recursive = args.some((a) => /^-[^-]*[rR]/.test(a) || a === "--recursive");
        if (recursive) findings.push(...this.recursiveDelete("Recursive delete (rm -r)", ops, cwd));
        for (const t of ops) pushIf(findings, this.noDelete(t, cwd));
      }
      if (name === "rmdir" || name === "unlink") for (const t of ops) pushIf(findings, this.noDelete(t, cwd));
      if (name === "find" && (args.includes("-delete") || /(^|\s)-exec(dir)?\s+(\S*\/)?rm\b/.test(args.join(" ")))) {
        const firstExpr = args.findIndex((a) => /^[-(!]/.test(a));
        const roots = firstExpr === -1 ? args : args.slice(0, firstExpr);
        findings.push(...this.recursiveDelete("find … -delete", roots.length ? roots : ["."], cwd));
      }
      if (name === "mv" && ops.length >= 2) {
        for (const t of ops.slice(0, -1)) pushIf(findings, this.noDelete(t, cwd));
        pushIf(findings, this.readOnly(ops[ops.length - 1], cwd));
      }
      if ((name === "cp" || name === "install" || name === "ln") && ops.length >= 2) {
        pushIf(findings, this.readOnly(ops[ops.length - 1], cwd));
      }
      if (name === "tee" || name === "truncate") for (const t of ops) pushIf(findings, this.readOnly(t, cwd));
      if (name === "sed" && args.some((a) => /^(-i|--in-place)/.test(a) || /^-[^-]*i/.test(a))) {
        // The first operand is the script (or the value of -e); the rest are files edited in place.
        for (const t of ops.slice(1)) pushIf(findings, this.readOnly(t, cwd));
      }
      for (const t of redirectTargets(words)) pushIf(findings, this.readOnly(t, cwd));

      // Secrets: only file arguments of commands that touch files (SECRET_ARG_COMMANDS), and `<` input.
      // Checking every word flagged rg patterns, commit messages and heredoc code (`event.key`).
      let fileArgs: string[] = [];
      if (SECRET_ARG_COMMANDS.has(name)) fileArgs = PATTERN_FIRST.has(name) ? ops.slice(1) : ops;
      for (const t of [...fileArgs, ...inputRedirects(words)]) {
        const path = t.includes("=") && !t.startsWith("/") ? t.slice(t.indexOf("=") + 1) : t;
        pushIf(findings, this.secret(path.replace(/^[A-Za-z0-9_.-]+@[^:]+:/, ""), cwd));
      }
    }
    return findings;
  }

  private toolPaths(toolName: string, input: unknown): Finding[] {
    if (typeof input !== "object" || input === null) return [];
    const record = input as Record<string, unknown>;
    const paths = PATH_KEYS.flatMap((k) => {
      const v = record[k];
      if (typeof v === "string") return [v];
      if (Array.isArray(v)) return v.filter((x): x is string => typeof x === "string");
      return [];
    });
    const findings: Finding[] = [];
    for (const p of paths) {
      pushIf(findings, this.secret(p, this.env.cwd));
      if (WRITE_TOOLS.has(toolName)) pushIf(findings, this.readOnly(p, this.env.cwd));
    }
    return findings;
  }
}

function pushIf(list: Finding[], f: Finding | undefined) {
  if (f) list.push(f);
}

export function decide(findings: Finding[]): Decision {
  if (!findings.length) return { action: "allow" };
  const unique = (fs: Finding[]) => [...new Set(fs.map((f) => f.reason))];
  const hard = findings.filter((f) => f.hard);
  if (hard.length) return { action: "block", reasons: unique(hard) };
  return { action: "ask", reasons: unique(findings) };
}
