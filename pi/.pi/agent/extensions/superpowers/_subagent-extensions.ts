/**
 * Extensions that superpowers subagents load, and the tools each one adds.
 *
 * Subagents run with `--no-extensions` and a `--tools` allowlist. Pi drops any
 * extension tool the allowlist does not name, so loading an extension without
 * allowing its tools silently gives the subagent nothing. Each entry here
 * pairs the extension with its tool names, and `resolveExtensions` returns
 * both, so the two cannot drift apart.
 *
 * Paths are resolved from the installed pi package's `package.json`
 * (`pi.extensions`), not hardcoded, so a reinstall or move does not break
 * loading. Unresolvable entries are reported in `missing`, never skipped
 * silently.
 */

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

type ExtensionSource =
  /** An installed pi package under the pi npm root, e.g. "@ff-labs/pi-fff". */
  | { kind: "package"; name: string }
  /** A file next to this module, e.g. "_web-standalone.ts". */
  | { kind: "local"; file: string };

interface ExtensionSpec {
  source: ExtensionSource;
  /** Tool names the extension registers; added to the subagent's --tools allowlist. */
  tools: readonly string[];
}

export const SUBAGENT_EXTENSIONS = {
  /** pi-fff: fast grep/find with frecency ranking. */
  piFff: { source: { kind: "package", name: "@ff-labs/pi-fff" }, tools: ["ffgrep", "fffind"] },
  /** condensed-milk: compresses old tool output; cm_recall restores it. */
  condensedMilk: { source: { kind: "package", name: "@tomooshi/condensed-milk-pi" }, tools: ["cm_recall"] },
  /** web_search + web_read from superpowers/web-search.ts. */
  webSearch: { source: { kind: "local", file: "_web-standalone.ts" }, tools: ["web_search", "web_read"] },
} as const satisfies Record<string, ExtensionSpec>;

export type SubagentExtension = keyof typeof SUBAGENT_EXTENSIONS;

export interface ResolveOptions {
  /** Directory holding installed pi npm packages. Default: ~/.pi/agent/npm/node_modules */
  packagesRoot?: string;
  /** Directory holding local extension files. Default: this module's directory. */
  localDir?: string;
}

export interface ResolvedExtensions {
  /** CLI args for pi: ["-e", path, ...] */
  args: string[];
  /** Tool names to add to the --tools allowlist. */
  tools: string[];
  /** Keys that could not be resolved to an existing file. */
  missing: SubagentExtension[];
}

export function defaultPackagesRoot(): string {
  return path.join(os.homedir(), ".pi", "agent", "npm", "node_modules");
}

function defaultLocalDir(): string {
  return path.dirname(new URL(import.meta.url).pathname);
}

/** Entry file of an installed pi package, from package.json `pi.extensions[0]`. */
export function resolvePackageEntry(name: string, packagesRoot = defaultPackagesRoot()): string | undefined {
  const dir = path.join(packagesRoot, name);
  try {
    const pkg: unknown = JSON.parse(fs.readFileSync(path.join(dir, "package.json"), "utf-8"));
    const entries = (pkg as { pi?: { extensions?: unknown } }).pi?.extensions;
    const first = Array.isArray(entries) ? entries[0] : undefined;
    if (typeof first !== "string") return undefined;
    const entry = path.resolve(dir, first);
    return fs.existsSync(entry) ? entry : undefined;
  } catch {
    return undefined;
  }
}

function resolveSource(source: ExtensionSource, opts: ResolveOptions): string | undefined {
  switch (source.kind) {
    case "package":
      return resolvePackageEntry(source.name, opts.packagesRoot);
    case "local": {
      const file = path.join(opts.localDir ?? defaultLocalDir(), source.file);
      return fs.existsSync(file) ? file : undefined;
    }
  }
}

export function resolveExtensions(keys: readonly SubagentExtension[], opts: ResolveOptions = {}): ResolvedExtensions {
  const result: ResolvedExtensions = { args: [], tools: [], missing: [] };
  for (const key of keys) {
    const spec: ExtensionSpec = SUBAGENT_EXTENSIONS[key];
    const file = resolveSource(spec.source, opts);
    if (!file) {
      result.missing.push(key);
      continue;
    }
    result.args.push("-e", file);
    result.tools.push(...spec.tools);
  }
  return result;
}

/** Add tool names to a comma-separated --tools allowlist, without duplicates. */
export function mergeToolAllowlist(base: string, extra: readonly string[]): string {
  const names = base.split(",").map((t) => t.trim()).filter(Boolean);
  for (const tool of extra) if (!names.includes(tool)) names.push(tool);
  return names.join(",");
}
