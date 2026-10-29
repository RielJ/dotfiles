import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, it } from "node:test";
import {
  normalizeSkillRequests,
  renderSkillBlocks,
  resolveRequestedSkills,
  type SkillCandidate,
} from "../skill-injection.ts";

const tempDirs: string[] = [];
afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

function candidate(
  name: string,
  scope: SkillCandidate["scope"],
  root = scope,
): SkillCandidate {
  const filePath = `/${root}/${name}/SKILL.md`;
  return { name, scope, filePath, baseDir: `/${root}/${name}` };
}

describe("orchestrator-selected skills", () => {
  it("normalizes names, scopes, and duplicate requests", () => {
    assert.deepEqual(
      normalizeSkillRequests([
        " /skill:principles ",
        "skill:principles",
        { name: "principles", scope: "global" },
        { name: "/skill:principles", scope: "global" },
        "",
      ]),
      [{ name: "principles" }, { name: "principles", scope: "global" }],
    );
  });

  it("uses Pi's winning skill when no scope is requested", () => {
    const result = resolveRequestedSkills(["principles"], [
      candidate("principles", "local"),
      candidate("principles", "global"),
    ]);

    assert.equal(result.ok, true);
    if (result.ok) assert.equal(result.skills[0]?.scope, "local");
  });

  it("selects a shadowed global or local skill by scope", () => {
    const candidates = [
      candidate("principles", "local"),
      candidate("principles", "global"),
    ];
    const result = resolveRequestedSkills(
      [
        { name: "principles", scope: "global" },
        { name: "principles", scope: "local" },
      ],
      candidates,
    );

    assert.equal(result.ok, true);
    if (result.ok) {
      assert.deepEqual(
        result.skills.map((skill) => skill.scope),
        ["global", "local"],
      );
    }
  });

  it("explains when a skill exists only in another scope", () => {
    const result = resolveRequestedSkills(
      [{ name: "principles", scope: "local" }],
      [candidate("principles", "global")],
    );

    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.match(result.error, /No local skill named principles/);
      assert.match(result.error, /Found: global/);
    }
  });

  it("rejects unknown skills with the available names", () => {
    const result = resolveRequestedSkills(["architecture"], [
      candidate("principles", "global"),
    ]);

    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.match(result.error, /Unknown skill: architecture/);
      assert.match(result.error, /Available skills: principles \(global\)/);
    }
  });

  it("does not cap the number of selected skills", () => {
    const names = Array.from({ length: 12 }, (_, index) => `skill-${index}`);
    const result = resolveRequestedSkills(
      names,
      names.map((name) => candidate(name, "global")),
    );

    assert.equal(result.ok, true);
    if (result.ok) assert.equal(result.skills.length, 12);
  });

  it("renders skill bodies like Pi's /skill expansion", () => {
    const dir = mkdtempSync(join(tmpdir(), "subagent-skills-"));
    tempDirs.push(dir);
    const skillDir = join(dir, "principles");
    const skillFile = join(skillDir, "SKILL.md");
    mkdirSync(skillDir);
    writeFileSync(
      skillFile,
      "---\nname: principles\ndescription: Use principles.\n---\n\n# Principles\n\nRead references/root-causes.md.\n",
    );

    assert.equal(
      renderSkillBlocks([
        {
          name: "principles",
          scope: "global",
          filePath: skillFile,
          baseDir: skillDir,
        },
      ]),
      `<skill name="principles" scope="global" location="${skillFile}">\nReferences are relative to ${skillDir}.\n\n# Principles\n\nRead references/root-causes.md.\n</skill>`,
    );
  });
});
