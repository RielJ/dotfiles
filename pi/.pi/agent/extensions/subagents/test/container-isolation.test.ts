import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, realpathSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { after, before, describe, it } from "node:test";
import {
  cloneResourceNames,
  createSandbox,
  destroySandbox,
  docker,
  sensitiveSourceReason,
  streamTarIntoSandbox,
  parseGitSource,
  parseSource,
  type Sandbox,
  SANDBOX_USER,
  sandboxRunArgs,
  sandboxSlug,
} from "../container-isolation.ts";

describe("parseGitSource", () => {
  it("accepts plain https URLs", () => {
    assert.equal(parseGitSource("https://github.com/a/b"), "https://github.com/a/b");
    assert.equal(parseGitSource(" https://github.com/a/b.git "), "https://github.com/a/b.git");
  });

  for (const bad of [
    "http://github.com/a/b",
    "ssh://git@github.com/a/b",
    "git@github.com:a/b.git",
    "file:///etc",
    "ext::sh -c touch% /tmp/pwned",
    "https://user:token@github.com/a/b",
    "https://github.com/a/b?x=1",
    "--upload-pack=touch /tmp/pwned",
  ]) {
    it(`refuses ${bad}`, () => assert.equal(parseGitSource(bad), null));
  }
});

describe("parseSource", () => {
  it("treats URLs as git and refuses unsafe schemes", () => {
    assert.deepEqual(parseSource("https://github.com/a/b", "/"), { kind: "git", url: "https://github.com/a/b" });
    assert.throws(() => parseSource("file:///etc/passwd", "/"), /Unsupported source/);
    assert.throws(() => parseSource("ext::sh", "/"), /Unsupported source/);
  });

  it("resolves local paths and refuses missing ones", () => {
    assert.deepEqual(parseSource("tmp", "/"), { kind: "path", path: realpathSync.native("/tmp") });
    assert.throws(() => parseSource("/definitely/not/here", "/"), /does not exist/);
  });

  it("refuses / and folders that contain the home folder", () => {
    const home = homedir();
    assert.throws(() => parseSource("/", "/"), /it is \//);
    assert.throws(() => parseSource(home, "/"), /home folder/);
    assert.throws(() => parseSource(dirname(home), "/"), /home folder/);
    assert.equal(parseSource(join(home, "dotfiles"), "/").kind, "path");
  });

  // Regression: on macOS these spell the home folder but passed a string check.
  const home = homedir();
  const aliases = [home.toLowerCase(), home.toUpperCase(), `/System/Volumes/Data${home}`]
    .filter((p) => p !== home && existsSync(p));
  for (const alias of aliases) {
    it(`refuses the home-folder alias ${alias}`, () => {
      assert.throws(() => parseSource(alias, "/"), /home folder/);
    });
  }

  it("refuses credential folders under home, by any spelling", () => {
    const ssh = join(home, ".ssh");
    if (existsSync(ssh)) {
      assert.throws(() => parseSource(ssh, "/"), /credentials/);
      assert.throws(() => parseSource(ssh.toUpperCase(), "/"), /credentials/);
    }
  });
});

describe("sensitiveSourceReason", () => {
  const home = "/Users/me";
  for (const [path, why] of [
    ["/", /it is \//],
    ["/Users", /home folder/],
    ["/Users/me", /home folder/],
    ["/Users/me/.ssh", /\.ssh/],
    ["/Users/me/.aws/credentials", /\.aws/],
    ["/Users/me/Library/Keychains", /Library/],
    ["/Users/me/.pi/agent", /\.pi/],
  ] as const) {
    it(`refuses ${path}`, () => assert.match(sensitiveSourceReason(path, home) ?? "", why));
  }
  for (const path of ["/Users/me/code/app", "/Users/meander", "/tmp/x", "/Users/me/.sshx"]) {
    it(`allows ${path}`, () => assert.equal(sensitiveSourceReason(path, home), null));
  }
});

describe("sandboxRunArgs", () => {
  it("offline mode has no network and no proxy env", () => {
    const args = sandboxRunArgs({ container: "c", image: "img", network: "offline", networkName: null, proxy: null });
    assert.equal(args[args.indexOf("--network") + 1], "none");
    assert.ok(!args.some((a) => a.includes("PROXY")));
    for (const flag of ["--read-only", "--rm", "--init"]) assert.ok(args.includes(flag), flag);
    assert.equal(args[args.indexOf("--cap-drop") + 1], "ALL");
    assert.equal(args[args.indexOf("--user") + 1], SANDBOX_USER);
    assert.ok(!args.some((a) => a.startsWith("/Users") || a.includes(":/")), "no host bind mounts");
  });

  it("web mode joins only the internal network and points at the proxy", () => {
    const args = sandboxRunArgs({ container: "c", image: "img", network: "web", networkName: "c-net", proxy: "c-proxy" });
    assert.equal(args[args.indexOf("--network") + 1], "c-net");
    assert.ok(args.includes("HTTPS_PROXY=http://c-proxy:3128"));
  });

  it("slugs are docker-safe", () => {
    assert.equal(sandboxSlug("Audit: GitHub repo!", "AB12"), "pi-sbx-audit-github-repo-ab12");
  });
});

const dockerUp = spawnSync("docker", ["info"], { stdio: "ignore", timeout: 20_000 }).status === 0;
const online = dockerUp && process.env.PI_SANDBOX_TEST_ONLINE !== "0";

async function sh(sandbox: Sandbox, script: string) {
  return docker(["exec", "-u", SANDBOX_USER, sandbox.container, "sh", "-c", script], { timeoutMs: 60_000 });
}

describe("offline sandbox (docker)", { skip: !dockerUp && "docker not running" }, () => {
  let sandbox: Sandbox;
  let src: string;

  before(async () => {
    src = mkdtempSync(join(tmpdir(), "sbx-src-"));
    mkdirSync(join(src, "app"));
    writeFileSync(join(src, "app", "index.js"), "console.log('hi')\n");
    // A symlink to a host secret must arrive as a link, never as the file.
    symlinkSync("/etc/hosts", join(src, "app", "leak"));
    sandbox = await createSandbox({
      name: "test offline",
      id: Math.random().toString(16).slice(2, 8),
      network: "offline",
      source: { kind: "path", path: join(src, "app") },
    });
  });

  after(async () => {
    if (sandbox) await destroySandbox(sandbox);
    rmSync(src, { recursive: true, force: true });
  });

  it("is hardened", async () => {
    const r = await sh(
      sandbox,
      'id -u; grep CapEff /proc/self/status; touch /etc/x 2>/dev/null && echo rw-root || echo ro-root; test -e /Users && echo host-fs || echo no-host-fs; env | sort',
    );
    assert.equal(r.code, 0, r.stderr);
    assert.match(r.stdout, /^10001$/m);
    assert.match(r.stdout, /CapEff:\s+0+$/m);
    assert.match(r.stdout, /ro-root/);
    assert.match(r.stdout, /no-host-fs/);
    assert.doesNotMatch(r.stdout, /PI_|ANTHROPIC|TOKEN|SSH_AUTH_SOCK|\/Users\//);
  });

  it("has no network", async () => {
    const r = await sh(sandbox, "curl -sS -m 5 https://example.com -o /dev/null; echo rc=$?; getent hosts example.com || echo no-dns");
    assert.match(r.stdout, /rc=(6|7)/);
    assert.match(r.stdout, /no-dns/);
  });

  it("copied the source without following symlinks", async () => {
    const r = await sh(sandbox, "cat /work/app/index.js; readlink /work/app/leak; test -f /work/app/leak && echo resolved || echo dangling");
    assert.match(r.stdout, /console\.log/);
    assert.match(r.stdout, /^\/etc\/hosts$/m);
    const own = await sh(sandbox, "stat -c %u /work/app/index.js");
    assert.equal(own.stdout.trim(), "10001");
  });

  it("destroy removes the container and is idempotent", async () => {
    await destroySandbox(sandbox);
    const r = await docker(["inspect", sandbox.container]);
    assert.notEqual(r.code, 0);
    await destroySandbox(sandbox);
  });
});

describe("source streaming limits (docker)", { skip: !dockerUp && "docker not running" }, () => {
  let sandbox: Sandbox;
  before(async () => {
    sandbox = await createSandbox({ name: "test limits", id: Math.random().toString(16).slice(2, 8), network: "offline" });
  });
  after(async () => {
    if (sandbox) await destroySandbox(sandbox);
  });

  it("aborts a source over the size cap, even after tar stops reading", async () => {
    // Zeros look like a tar end-of-archive marker, so tar exits early. The
    // producer must still be drained and counted, not left blocked forever.
    const producer = spawn("sh", ["-c", "head -c 8388608 /dev/zero"]);
    producer.stdin.end();
    await assert.rejects(
      streamTarIntoSandbox({ producer, container: sandbox.container, label: "Copying big", maxBytes: 1024 ** 2, timeoutMs: 20_000 }),
      /Copying big failed: source is larger than 1 MiB/,
    );
    assert.equal((await sh(sandbox, "echo alive")).stdout.trim(), "alive");
  });

  it("aborts a source that stalls past the timeout and runs onAbort", async () => {
    const producer = spawn("sh", ["-c", "sleep 20"]);
    producer.stdin.end();
    let aborted = false;
    const started = Date.now();
    await assert.rejects(
      streamTarIntoSandbox({
        producer, container: sandbox.container, label: "Copying slow", maxBytes: 1024 ** 2, timeoutMs: 1_000,
        onAbort: async () => { aborted = true; },
      }),
      /Copying slow failed: timed out/,
    );
    assert.ok(aborted);
    assert.ok(Date.now() - started < 10_000);
  });

  it("reports a tar the sandbox cannot unpack", async () => {
    const producer = spawn("sh", ["-c", "echo not-a-tar"]);
    producer.stdin.end();
    await assert.rejects(
      streamTarIntoSandbox({ producer, container: sandbox.container, label: "Copying junk", maxBytes: 1024 ** 2, timeoutMs: 20_000 }),
      /unpacking in the sandbox/,
    );
  });
});

async function assertNoCloneLeftovers(container: string) {
  const names = cloneResourceNames(container);
  for (const name of [container, names.clone, names.proxy]) {
    assert.notEqual((await docker(["inspect", "--type", "container", name])).code, 0, `${name} left behind`);
  }
  assert.notEqual((await docker(["network", "inspect", names.network])).code, 0, `${names.network} left behind`);
}

describe("git source (docker, online)", { skip: !online && "docker not running or PI_SANDBOX_TEST_ONLINE=0" }, () => {
  let sandbox: Sandbox | undefined;
  after(async () => {
    if (sandbox) await destroySandbox(sandbox);
  });

  it("clones into an offline sandbox", async () => {
    sandbox = await createSandbox({
      name: "test clone",
      id: Math.random().toString(16).slice(2, 8),
      network: "offline",
      source: { kind: "git", url: "https://github.com/octocat/Hello-World" },
    });
    const r = await sh(sandbox, "ls -A /work; git -C /work log --oneline | head -1; git -C /work config core.hooksPath");
    assert.equal(r.code, 0, r.stderr);
    assert.match(r.stdout, /README/);
    assert.match(r.stdout, /\/dev\/null/);
  });

  it("fails cleanly on a bad repo and leaves nothing behind", async () => {
    const id = Math.random().toString(16).slice(2, 8);
    await assert.rejects(
      createSandbox({ name: "test bad", id, network: "offline", source: { kind: "git", url: "https://github.com/octocat/does-not-exist-xyz" } }),
      /Cloning .* failed/,
    );
    await assertNoCloneLeftovers(sandboxSlug("test bad", id));
  });

  // Regression: the clone ran on the bridge network with no egress filter, so
  // a source URL (or a redirect) could reach the host or the LAN.
  for (const url of ["https://host.docker.internal/x.git", "https://169.254.169.254/x.git", "https://192.168.1.1/x.git"]) {
    it(`refuses to clone from a private address: ${url}`, async () => {
      const id = Math.random().toString(16).slice(2, 8);
      await assert.rejects(
        createSandbox({ name: "test ssrf", id, network: "offline", source: { kind: "git", url } }),
        /Cloning .* failed/,
      );
      await assertNoCloneLeftovers(sandboxSlug("test ssrf", id));
    });
  }
});

describe("web sandbox (docker, online)", { skip: !online && "docker not running or PI_SANDBOX_TEST_ONLINE=0" }, () => {
  let sandbox: Sandbox;
  before(async () => {
    sandbox = await createSandbox({ name: "test web", id: Math.random().toString(16).slice(2, 8), network: "web" });
  });
  after(async () => {
    if (sandbox) await destroySandbox(sandbox);
  });

  it("reaches public sites through the proxy", async () => {
    const r = await sh(sandbox, "curl -sS -m 20 -o /dev/null -w '%{http_code}' https://example.com");
    assert.equal(r.stdout.trim(), "200", r.stderr);
  });

  it("has no direct route or DNS without the proxy", async () => {
    const r = await sh(sandbox, "curl -sS -m 5 --noproxy '*' https://1.1.1.1 -o /dev/null; echo rc=$?; getent hosts example.com || echo no-dns");
    assert.match(r.stdout, /rc=(6|7|28)/);
    assert.match(r.stdout, /no-dns/);
  });

  for (const target of [
    "http://host.docker.internal/",
    "http://169.254.169.254/latest/meta-data/",
    "http://127.0.0.1/",
    "http://192.168.1.1/",
    "http://localhost/",
    "https://example.com:8443/",
  ]) {
    it(`proxy refuses ${target}`, async () => {
      const r = await sh(sandbox, `curl -sS -m 10 -o /dev/null -w '%{http_code}' '${target}'; echo`);
      assert.doesNotMatch(r.stdout, /^200/m, r.stdout + r.stderr);
      const logs = await docker(["logs", sandbox.proxy!]);
      const url = new URL(target);
      const port = Number(url.port || (url.protocol === "https:" ? 443 : 80));
      const entry = logs.stdout
        .split("\n")
        .filter(Boolean)
        .map((line) => JSON.parse(line))
        .find((e) => e.host === url.hostname && e.port === port);
      const host = `${url.hostname}:${port}`;
      assert.ok(entry, `no proxy log entry for ${host}`);
      assert.equal(entry.action, "deny", JSON.stringify(entry));
    });
  }

  it("destroy removes proxy and network too", async () => {
    await destroySandbox(sandbox);
    assert.notEqual((await docker(["inspect", sandbox.proxy!])).code, 0);
    assert.notEqual((await docker(["network", "inspect", sandbox.networkName!])).code, 0);
  });
});
