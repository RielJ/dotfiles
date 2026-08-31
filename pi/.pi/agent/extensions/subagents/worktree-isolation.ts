import {
  WorktreeManager,
  resolveGitRoot,
} from "../git-worktrees/src/worktree-manager.ts";

export interface AllocatedWorktree {
  id: string;
  path: string;
  branch: string;
}

export async function allocateSubagentWorktree(options: {
  cwd: string;
  task: string;
  name: string;
  branch?: string;
}): Promise<AllocatedWorktree> {
  const repoRoot = resolveGitRoot(options.cwd);
  if (!repoRoot) {
    throw new Error(
      `Cannot use worktree isolation from ${options.cwd}: not a git repository. ` +
        `Use isolation: "shared" or choose a repository cwd.`,
    );
  }

  const manager = new WorktreeManager(repoRoot);
  const record = await manager.allocate(options.task, {
    slug: options.name,
    branch: options.branch,
  });
  return {
    id: record.id,
    path: record.worktreePath,
    branch: record.branch,
  };
}
