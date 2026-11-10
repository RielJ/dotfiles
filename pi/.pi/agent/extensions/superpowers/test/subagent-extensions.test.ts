import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { describe, it } from "node:test";
import {
  defaultPackagesRoot,
  mergeToolAllowlist,
  resolveExtensions,
  resolvePackageEntry,
  SUBAGENT_EXTENSIONS,
  type SubagentExtension,
} from "../_subagent-extensions.ts";

function fixture(): { root: string; local: string } {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), "subagent-ext-"));
  const root = path.join(base, "node_modules");
  const pkg = path.join(root, "@ff-labs", "pi-fff");
  fs.mkdirSync(path.join(pkg, "src"), { recursive: true });
  fs.writeFileSync(path.join(pkg, "package.json"), JSON.stringify({ pi: { extensions: ["./src/index.ts"] } }));
  fs.writeFileSync(path.join(pkg, "src", "index.ts"), "");
  const local = path.join(base, "local");
  fs.mkdirSync(local);
  fs.writeFileSync(path.join(local, "_web-standalone.ts"), "");
  return { root, local };
}

describe("resolvePackageEntry", () => {
  it("follows package.json pi.extensions", () => {
    const { root } = fixture();
    assert.equal(resolvePackageEntry("@ff-labs/pi-fff", root), path.join(root, "@ff-labs", "pi-fff", "src", "index.ts"));
  });
  it("returns undefined for a package that is not installed", () => {
    const { root } = fixture();
    assert.equal(resolvePackageEntry("@nope/missing", root), undefined);
  });
});

describe("resolveExtensions", () => {
  it("returns -e args and the tools of every resolved extension", () => {
    const { root, local } = fixture();
    const r = resolveExtensions(["piFff", "webSearch"], { packagesRoot: root, localDir: local });
    assert.deepEqual(r.args, ["-e", path.join(root, "@ff-labs", "pi-fff", "src", "index.ts"), "-e", path.join(local, "_web-standalone.ts")]);
    assert.deepEqual(r.tools, ["ffgrep", "fffind", "web_search", "web_read"]);
    assert.deepEqual(r.missing, []);
  });
  it("reports unresolvable extensions instead of skipping them silently", () => {
    const { root, local } = fixture();
    const r = resolveExtensions(["piFff", "condensedMilk"], { packagesRoot: root, localDir: local });
    assert.deepEqual(r.missing, ["condensedMilk"]);
    assert.ok(!r.tools.includes("cm_recall"), "a missing extension must not add its tools");
  });
});

describe("mergeToolAllowlist", () => {
  it("appends new tools once and keeps order", () => {
    assert.equal(mergeToolAllowlist("read,grep, bash", ["ffgrep", "read", "ffgrep"]), "read,grep,bash,ffgrep");
  });
});

// Guards against the regression this module fixes: hardcoded paths went stale
// and every subagent ran with no extensions. Skips on machines without pi's
// npm root (e.g. CI).
describe("installed subagent extensions", { skip: !fs.existsSync(defaultPackagesRoot()) }, () => {
  it("all resolve on this machine", () => {
    const keys = Object.keys(SUBAGENT_EXTENSIONS) as SubagentExtension[];
    assert.deepEqual(resolveExtensions(keys).missing, []);
  });
});
