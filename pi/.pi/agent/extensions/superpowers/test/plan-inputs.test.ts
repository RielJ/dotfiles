import { describe, it } from "node:test";
import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import {
  composePlannerTask,
  explorerPreContext,
  loadContextFile,
  MAX_PROVIDED_CONTEXT_CHARS,
  parsePlanArgs,
} from "../_plan-inputs.ts";

describe("parsePlanArgs", () => {
  it("keeps a plain task", () => {
    assert.deepEqual(parsePlanArgs("  add a cache layer "), { wait: false, web: false, task: "add a cache layer" });
  });

  it("reads flags anywhere in the arguments", () => {
    assert.deepEqual(parsePlanArgs("rewrite --web in rust --context docs/r.md --wait"), {
      wait: true,
      web: true,
      contextFile: "docs/r.md",
      task: "rewrite in rust",
    });
  });

  it("accepts --context=<path>", () => {
    assert.equal(parsePlanArgs("--context=a.md task").contextFile, "a.md");
  });

  it("rejects --context without a path", () => {
    assert.throws(() => parsePlanArgs("task --context"), /needs a file path/);
    assert.throws(() => parsePlanArgs("task --context --web"), /needs a file path/);
    assert.throws(() => parsePlanArgs("task --context="), /needs a file path/);
  });
});

describe("loadContextFile", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "plan-inputs-"));
  fs.writeFileSync(path.join(dir, "r.md"), "\n# Research\nuse tokio\n");
  fs.writeFileSync(path.join(dir, "empty.md"), "  \n");

  it("reads relative to cwd and trims", () => {
    assert.deepEqual(loadContextFile(dir, "r.md"), { label: "r.md", text: "# Research\nuse tokio", truncated: false });
  });

  it("truncates past the cap", () => {
    const loaded = loadContextFile(dir, "r.md", 5);
    assert.equal(loaded.text, "# Res");
    assert.equal(loaded.truncated, true);
  });

  it("throws on missing or empty files", () => {
    assert.throws(() => loadContextFile(dir, "nope.md"), /not found/);
    assert.throws(() => loadContextFile(dir, "empty.md"), /empty/);
  });
});

describe("composePlannerTask", () => {
  const provided = { label: "r.md", text: "RESEARCH", truncated: false };

  it("returns the bare task when nothing else exists", () => {
    assert.equal(composePlannerTask({ task: "T" }), "T");
  });

  it("orders conversation, research, findings, task", () => {
    const out = composePlannerTask({ task: "T", provided, findings: "FIND", conversation: "CONV" });
    const order = ["## Conversation Context", "## Provided Research (r.md)", "## Codebase Exploration Findings (Phase 0)", "## Task to Plan"].map((h) => out.indexOf(h));
    assert.ok(order.every((i) => i >= 0), "every section present");
    assert.deepEqual([...order].sort((a, b) => a - b), order, "sections in order");
    assert.ok(out.endsWith("## Task to Plan\n\nT"));
  });

  it("notes truncation so planners can read the rest", () => {
    const out = composePlannerTask({ task: "T", provided: { ...provided, truncated: true } });
    assert.match(out, new RegExp(`truncated to ${MAX_PROVIDED_CONTEXT_CHARS / 1000}K chars; read r\\.md`));
  });
});

describe("explorerPreContext", () => {
  it("is undefined without research", () => {
    assert.equal(explorerPreContext(undefined), undefined);
  });

  it("tells the explorer not to redo the research", () => {
    const out = explorerPreContext({ label: "r.md", text: "RESEARCH", truncated: false }) ?? "";
    assert.match(out, /Do not repeat it/);
    assert.ok(out.includes("RESEARCH"));
  });
});
