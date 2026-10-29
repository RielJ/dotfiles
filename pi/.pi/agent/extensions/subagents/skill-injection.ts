import { readFileSync } from "node:fs";

export type SkillScope = "global" | "local";
export type SkillCandidateScope = SkillScope | "temporary";

export type SkillRequest = string | { name: string; scope?: SkillScope };

export interface NormalizedSkillRequest {
  name: string;
  scope?: SkillScope;
}

export interface SkillCandidate {
  name: string;
  scope: SkillCandidateScope;
  filePath: string;
  baseDir: string;
}

export type ResolveSkillsResult =
  | { ok: true; skills: SkillCandidate[] }
  | { ok: false; error: string };

function normalizeSkillName(raw: string): string {
  return raw.trim().replace(/^\/?skill:/, "").trim();
}

export function normalizeSkillRequests(
  requests: readonly SkillRequest[] | undefined,
): NormalizedSkillRequest[] {
  const normalized: NormalizedSkillRequest[] = [];
  const seen = new Set<string>();

  for (const request of requests ?? []) {
    const name = normalizeSkillName(
      typeof request === "string" ? request : request.name,
    );
    const scope = typeof request === "string" ? undefined : request.scope;
    if (!name) continue;

    const key = `${scope ?? "auto"}:${name}`;
    if (seen.has(key)) continue;
    seen.add(key);
    normalized.push(scope ? { name, scope } : { name });
  }

  return normalized;
}

function formatAvailable(candidates: readonly SkillCandidate[]): string {
  const scopesByName = new Map<string, Set<SkillCandidateScope>>();
  for (const candidate of candidates) {
    const scopes = scopesByName.get(candidate.name) ?? new Set();
    scopes.add(candidate.scope);
    scopesByName.set(candidate.name, scopes);
  }

  return (
    [...scopesByName.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([name, scopes]) => `${name} (${[...scopes].join("/")})`)
      .join(", ") || "(none)"
  );
}

/**
 * Pick one skill file per request. Candidates must be in Pi precedence order:
 * an unscoped request uses the first match, which is the skill Pi would load.
 */
export function resolveRequestedSkills(
  requests: readonly SkillRequest[] | undefined,
  candidates: readonly SkillCandidate[],
): ResolveSkillsResult {
  const selected: SkillCandidate[] = [];
  const selectedFiles = new Set<string>();
  const unknown: string[] = [];
  const wrongScope: string[] = [];

  for (const request of normalizeSkillRequests(requests)) {
    const matches = candidates.filter(
      (candidate) => candidate.name === request.name,
    );
    if (matches.length === 0) {
      unknown.push(request.name);
      continue;
    }

    const skill = request.scope
      ? matches.find((candidate) => candidate.scope === request.scope)
      : matches[0];
    if (!skill) {
      const found = [...new Set(matches.map((match) => match.scope))].join(
        ", ",
      );
      wrongScope.push(
        `No ${request.scope} skill named ${request.name}. Found: ${found}.`,
      );
      continue;
    }

    if (selectedFiles.has(skill.filePath)) continue;
    selectedFiles.add(skill.filePath);
    selected.push(skill);
  }

  const errors = [...wrongScope];
  if (unknown.length > 0) {
    const label = unknown.length === 1 ? "Unknown skill" : "Unknown skills";
    errors.push(
      `${label}: ${unknown.join(", ")}. Available skills: ${formatAvailable(candidates)}.`,
    );
  }

  return errors.length > 0
    ? { ok: false, error: errors.join("\n") }
    : { ok: true, skills: selected };
}

function stripFrontmatter(content: string): string {
  return content.replace(/^---\r?\n[\s\S]*?\r?\n---(?:\r?\n|$)/, "");
}

export function renderSkillBlocks(skills: readonly SkillCandidate[]): string {
  return skills
    .map((skill) => {
      const body = stripFrontmatter(readFileSync(skill.filePath, "utf8")).trim();
      return `<skill name="${skill.name}" scope="${skill.scope}" location="${skill.filePath}">\nReferences are relative to ${skill.baseDir}.\n\n${body}\n</skill>`;
    })
    .join("\n\n");
}
