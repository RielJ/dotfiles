import {
  DefaultPackageManager,
  SettingsManager,
  loadSkills,
} from "@earendil-works/pi-coding-agent";
import { realpathSync } from "node:fs";
import { dirname } from "node:path";
import type {
  SkillCandidate,
  SkillCandidateScope,
} from "./skill-injection.ts";

export interface ActiveSkillCommand {
  name: string;
  source: string;
  sourceInfo?: {
    path?: string;
    scope?: string;
  };
}

function toCandidateScope(scope: string | undefined): SkillCandidateScope {
  if (scope === "project") return "local";
  if (scope === "user") return "global";
  return "temporary";
}

function fileIdentity(filePath: string): string {
  try {
    return realpathSync(filePath);
  } catch {
    return filePath;
  }
}

/**
 * Return skill files in Pi precedence order, including skills shadowed by a
 * same-name skill in another scope. Active skills come first so an unscoped
 * request matches the skill Pi loaded for the orchestrator.
 */
export async function discoverSkillCandidates(options: {
  cwd: string;
  agentDir: string;
  projectTrusted: boolean;
  activeCommands: readonly ActiveSkillCommand[];
}): Promise<SkillCandidate[]> {
  const candidates: SkillCandidate[] = [];
  const seenFiles = new Set<string>();
  const add = (candidate: SkillCandidate) => {
    const identity = fileIdentity(candidate.filePath);
    if (seenFiles.has(identity)) return;
    seenFiles.add(identity);
    candidates.push(candidate);
  };

  for (const command of options.activeCommands) {
    const filePath = command.sourceInfo?.path;
    if (
      command.source !== "skill" ||
      !command.name.startsWith("skill:") ||
      !filePath
    ) {
      continue;
    }
    add({
      name: command.name.slice("skill:".length),
      scope: toCandidateScope(command.sourceInfo?.scope),
      filePath,
      baseDir: dirname(filePath),
    });
  }

  const settingsManager = SettingsManager.create(
    options.cwd,
    options.agentDir,
    { projectTrusted: options.projectTrusted },
  );
  const packageManager = new DefaultPackageManager({
    cwd: options.cwd,
    agentDir: options.agentDir,
    settingsManager,
  });
  // Never install a missing package while preparing a subagent prompt.
  const resolved = await packageManager.resolve(async () => "skip");

  for (const resource of resolved.skills) {
    if (!resource.enabled) continue;
    const loaded = loadSkills({
      cwd: options.cwd,
      agentDir: options.agentDir,
      skillPaths: [resource.path],
      includeDefaults: false,
    });
    for (const skill of loaded.skills) {
      add({
        name: skill.name,
        scope: toCandidateScope(resource.metadata.scope),
        filePath: skill.filePath,
        baseDir: skill.baseDir,
      });
    }
  }

  return candidates;
}
