import { isAbsolute, normalize, resolve } from "node:path";

/**
 * Path patterns from damage-control-rules.yaml:
 *   "~/.ssh/", "/etc/"     directory by absolute location: the dir and everything inside it
 *   "dist/", ".git/"       directory by name: any path with that segment
 *   "*.pem", ".env.*.local" basename glob; `*` does not match a leading dot (shell rules)
 *   "~/.bashrc"            one absolute file
 *   ".env", "Cargo.lock"   basename
 */

export type PathEnv = { cwd: string; home: string; tempRoots: string[] };

/** Expand ~, $HOME and $TMPDIR; returns undefined when other variables or substitutions remain. */
export function expandPath(raw: string, env: PathEnv): string | undefined {
  let p = raw;
  if (p === "~" || p.startsWith("~/")) p = env.home + p.slice(1);
  p = p.replace(/^\$\{?HOME\}?(?=\/|$)/, env.home);
  p = p.replace(/^\$\{?TMPDIR\}?(?=\/|$)/, env.tempRoots[env.tempRoots.length - 1] ?? "/tmp");
  if (/[$`]/.test(p)) return undefined;
  return p;
}

/** Absolute, normalized form of a path word relative to `cwd`. */
export function absolutePath(raw: string, env: PathEnv, cwd = env.cwd): string | undefined {
  const p = expandPath(raw, env);
  if (p === undefined) return undefined;
  return normalize(isAbsolute(p) ? p : resolve(cwd, p)).replace(/\/+$/, "") || "/";
}

/** True for paths strictly inside a temp root (the root itself is not exempt). */
export function isTempPath(abs: string, env: PathEnv): boolean {
  return env.tempRoots.some((root) => {
    const r = root.replace(/\/+$/, "");
    return abs.startsWith(`${r}/`) && abs.length > r.length + 1;
  });
}

function globToRegExp(glob: string): RegExp {
  const body = glob
    .split("*")
    .map((part) => part.replace(/[.+?^${}()|[\]\\]/g, "\\$&"))
    .join(".*");
  return new RegExp(`^${body}$`);
}

/** Does `abs` (absolute path) match one yaml path pattern? */
export function matchesPattern(pattern: string, abs: string, env: PathEnv): boolean {
  const base = abs.split("/").pop() ?? "";
  if (pattern.endsWith("/")) {
    if (pattern.startsWith("~/") || pattern.startsWith("/")) {
      const dir = (expandPath(pattern, env) ?? pattern).replace(/\/+$/, "");
      return abs === dir || abs.startsWith(`${dir}/`);
    }
    const name = pattern.slice(0, -1);
    return abs.split("/").includes(name);
  }
  if (pattern.startsWith("~/") || pattern.startsWith("/")) {
    return abs === expandPath(pattern, env);
  }
  if (pattern.includes("*")) {
    if (pattern.startsWith("*") && base.startsWith(".")) return false;
    return globToRegExp(pattern).test(base);
  }
  return base === pattern;
}

/** The first pattern that matches, ignoring temp paths. */
export function firstMatch(patterns: string[], abs: string, env: PathEnv): string | undefined {
  if (isTempPath(abs, env)) return undefined;
  return patterns.find((p) => matchesPattern(p, abs, env));
}
