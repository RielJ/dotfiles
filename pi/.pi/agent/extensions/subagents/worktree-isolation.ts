/**
 * Git worktree isolation for subagents, owned by this extension.
 *
 * Allocation: `<repoRoot>/.pi/git-worktrees/<slug>` on a branch this extension
 * creates with `git worktree add -b` (never `-B`, so an existing branch is
 * never reset). No git config is written.
 *
 * Release: a clean worktree is removed with `git worktree remove` (no
 * `--force`). A worktree with uncommitted or untracked files is kept, because
 * subagents leave their work uncommitted for review. Branches are never
 * deleted: the branch is the deliverable.
 */
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const WORKTREES_DIR = join(".pi", "git-worktrees");

export interface SubagentWorktree {
  /** The worktree's slug (directory name). */
  id: string;
  /** Main checkout of the repository the worktree belongs to. */
  repoRoot: string;
  /** Absolute worktree path. */
  path: string;
  /** Branch checked out in the worktree. */
  branch: string;
  /** Commit the worktree started at. */
  base: string;
  /** True when this extension created `branch`. */
  createdBranch: boolean;
}

/** Outcome of releasing a worktree when its subagent closes. */
export type WorktreeRelease =
  | { kind: "removed"; path: string; branch: string }
  | { kind: "kept-dirty"; path: string; branch: string; files: number }
  | { kind: "kept-error"; path: string; branch: string; error: string }
  | { kind: "already-gone"; path: string; branch: string };

type GitResult = { ok: true; stdout: string } | { ok: false; error: string };

function runGit(cwd: string, args: string[]): GitResult {
  const result = spawnSync("git", ["-C", cwd, ...args], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    timeout: 30_000,
  });
  if (result.error) return { ok: false, error: result.error.message };
  if (result.status !== 0) {
    const message = `${result.stderr ?? ""}`.trim() || `${result.stdout ?? ""}`.trim();
    return {
      ok: false,
      error: message || `git ${args[0]} exited with code ${result.status}`,
    };
  }
  return { ok: true, stdout: `${result.stdout ?? ""}`.trim() };
}

function gitOrThrow(cwd: string, args: string[], context: string): string {
  const result = runGit(cwd, args);
  if (!result.ok) throw new Error(`${context}: ${result.error}`);
  return result.stdout;
}

/**
 * The main checkout of the repository containing `cwd`: the first entry of
 * `git worktree list`, so this works from subdirectories, linked worktrees,
 * and submodules alike.
 */
export function resolveMainCheckout(cwd: string): string | null {
  const list = runGit(cwd, ["worktree", "list", "--porcelain"]);
  if (!list.ok) return null;
  const lines = list.stdout.split("\n");
  const first = lines.find((line) => line.startsWith("worktree "));
  if (!first) return null;
  // A bare main repository has no working tree to branch from.
  const firstBlock = lines.slice(0, lines.indexOf("") === -1 ? undefined : lines.indexOf(""));
  if (firstBlock.includes("bare")) return null;
  return first.slice("worktree ".length);
}

/** Directory- and branch-safe slug: lowercase, `[a-z0-9._-]`, no leading dot or dash. */
export function worktreeSlug(name: string): string {
  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/\.{2,}/g, ".")
    .replace(/-{2,}/g, "-")
    .replace(/^[-.]+|[-.]+$/g, "")
    .replace(/\.lock$/, "");
  return slug || "subagent";
}

function branchExists(repoRoot: string, branch: string): boolean {
  return runGit(repoRoot, ["show-ref", "--verify", "--quiet", `refs/heads/${branch}`]).ok;
}

/** Resolve a commit-ish (local branch, remote branch, tag, sha) to a sha, or null. */
function resolveCommit(repoRoot: string, rev: string): string | null {
  const result = runGit(repoRoot, [
    "rev-parse",
    "--verify",
    "--quiet",
    "--end-of-options",
    `${rev}^{commit}`,
  ]);
  return result.ok && result.stdout ? result.stdout : null;
}

function assertValidBranchName(repoRoot: string, branch: string): void {
  const check = runGit(repoRoot, ["check-ref-format", "--branch", branch]);
  if (!check.ok) {
    throw new Error(`Cannot create worktree branch "${branch}": not a valid branch name.`);
  }
}

/**
 * Keep the worktrees directory out of the main checkout's `git status` even
 * when `.pi/` is not ignored, without touching any tracked file or git config.
 */
function ensureWorktreesDir(repoRoot: string): string {
  const dir = join(repoRoot, WORKTREES_DIR);
  mkdirSync(dir, { recursive: true });
  const ignore = join(dir, ".gitignore");
  if (!existsSync(ignore)) writeFileSync(ignore, "*\n");
  return dir;
}

/**
 * Create a worktree for a subagent.
 *
 * Branch semantics:
 * - `branch` names an existing commit-ish (usually a branch): a new branch
 *   named after the slug is created at its tip. The requested branch is left
 *   alone, so it can stay checked out elsewhere and parallel subagents can
 *   start from the same base.
 * - `branch` does not exist: it is created from the main checkout's HEAD and
 *   checked out in the worktree.
 * - no `branch`: a branch named after the slug is created from the main
 *   checkout's HEAD.
 *
 * An existing branch is never reset; a collision throws.
 */
export function allocateSubagentWorktree(options: {
  cwd: string;
  name: string;
  branch?: string;
}): SubagentWorktree {
  const repoRoot = resolveMainCheckout(options.cwd);
  if (!repoRoot) {
    throw new Error(
      `Cannot use worktree isolation from ${options.cwd}: not a git repository with a working tree. ` +
        `Use isolation: "shared" or choose a repository cwd.`,
    );
  }

  const worktreesDir = ensureWorktreesDir(repoRoot);
  const baseSlug = worktreeSlug(options.name);
  let slug = baseSlug;
  for (let i = 2; existsSync(join(worktreesDir, slug)); i++) {
    slug = `${baseSlug}-${i}`;
  }
  const path = join(worktreesDir, slug);

  const requested = options.branch?.trim() || undefined;
  const requestedBase = requested ? resolveCommit(repoRoot, requested) : null;
  let branch: string;
  let base: string;
  if (requested && requestedBase) {
    branch = slug;
    base = requestedBase;
  } else {
    branch = requested ?? slug;
    const head = resolveCommit(repoRoot, "HEAD");
    if (!head) {
      throw new Error(
        `Cannot create a worktree in ${repoRoot}: the main checkout has no commits yet.`,
      );
    }
    base = head;
  }

  assertValidBranchName(repoRoot, branch);
  if (branchExists(repoRoot, branch)) {
    throw new Error(
      `Cannot create worktree branch "${branch}": branch "${branch}" already exists and is never reset. ` +
        `Give the subagent a different name` +
        (requested && requestedBase ? "" : " or pass a different branch") +
        `.`,
    );
  }

  // -b (not -B) fails instead of resetting if the branch appeared meanwhile.
  gitOrThrow(
    repoRoot,
    ["worktree", "add", "--quiet", "-b", branch, path, base],
    `git worktree add failed for ${path}`,
  );

  return { id: slug, repoRoot, path, branch, base, createdBranch: true };
}

/**
 * Make sure a previously allocated worktree exists before resuming its
 * subagent. A worktree removed on close is recreated at the same path on its
 * kept branch (checked out as-is, never reset).
 */
export function reattachSubagentWorktree(
  worktree: Pick<SubagentWorktree, "id" | "repoRoot" | "path" | "branch">,
): SubagentWorktree {
  const head = (cwd: string) => resolveCommit(cwd, "HEAD") ?? "";
  if (existsSync(worktree.path)) {
    return { ...worktree, base: head(worktree.path), createdBranch: false };
  }
  if (!branchExists(worktree.repoRoot, worktree.branch)) {
    throw new Error(
      `Cannot recreate worktree ${worktree.path}: branch "${worktree.branch}" no longer exists.`,
    );
  }
  runGit(worktree.repoRoot, ["worktree", "prune"]);
  gitOrThrow(
    worktree.repoRoot,
    ["worktree", "add", "--quiet", worktree.path, worktree.branch],
    `Cannot recreate worktree ${worktree.path} on branch "${worktree.branch}"`,
  );
  return { ...worktree, base: head(worktree.path), createdBranch: false };
}

/**
 * Remove a subagent's worktree if it is clean. Never throws, never uses
 * `--force`, never deletes the branch.
 */
export function releaseSubagentWorktree(
  worktree: Pick<SubagentWorktree, "repoRoot" | "path" | "branch">,
): WorktreeRelease {
  const { repoRoot, path, branch } = worktree;
  try {
    if (!existsSync(path)) {
      runGit(repoRoot, ["worktree", "prune"]);
      return { kind: "already-gone", path, branch };
    }
    const status = runGit(path, [
      "status",
      "--porcelain",
      "--untracked-files=all",
      "--ignore-submodules=none",
    ]);
    if (!status.ok) {
      return { kind: "kept-error", path, branch, error: status.error };
    }
    const files = status.stdout.split("\n").filter((line) => line.trim()).length;
    if (files > 0) return { kind: "kept-dirty", path, branch, files };

    const removed = runGit(repoRoot, ["worktree", "remove", path]);
    if (!removed.ok) {
      return { kind: "kept-error", path, branch, error: removed.error };
    }
    return { kind: "removed", path, branch };
  } catch (error) {
    return {
      kind: "kept-error",
      path,
      branch,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/** One-line report of a release for the orchestrator. */
export function describeWorktreeRelease(release: WorktreeRelease): string {
  switch (release.kind) {
    case "removed":
      return `Removed worktree ${release.path}; branch "${release.branch}" is kept.`;
    case "already-gone":
      return `Worktree ${release.path} was already gone; branch "${release.branch}" is kept.`;
    case "kept-dirty": {
      const one = release.files === 1;
      return (
        `Kept worktree ${release.path} (branch "${release.branch}") because it is dirty: ` +
        `${release.files} uncommitted or untracked ${one ? "file" : "files"}; ` +
        `commit or move ${one ? "it" : "them"}, ` +
        `then remove it with git worktree remove ${release.path}`
      );
    }
    case "kept-error":
      return (
        `Kept worktree ${release.path} (branch "${release.branch}"): git worktree remove failed: ` +
        `${release.error.replace(/\s*\n\s*/g, " ")}`
      );
    default: {
      const _exhaustive: never = release;
      return _exhaustive;
    }
  }
}
