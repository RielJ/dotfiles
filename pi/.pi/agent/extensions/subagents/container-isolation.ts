/**
 * Container isolation for subagents that inspect untrusted content.
 *
 * The child pi process (and its credentials) stays on the host. Its only tools
 * run inside a throwaway Docker container through `docker exec`, so a hostile
 * repository, page, or prompt injection can at most run commands in that
 * container. See README "Container isolation" for the threat model.
 *
 * Container hardening, every mode: non-root uid 10001, all capabilities
 * dropped, no-new-privileges, read-only root, tmpfs /tmp and $HOME, an
 * anonymous /work volume, pid/memory/CPU limits, no host mounts, no host env,
 * and a TTL after which the container stops and removes itself.
 *
 * Networks:
 * - offline: `--network none`. No DNS, no route.
 * - web: a per-sandbox `--internal` network (no route, no external DNS) plus
 *   a proxy container on that network and the default bridge. The proxy
 *   (container/bin/egress-proxy) allows ports 80/443 to public addresses only.
 *
 * A repository source is cloned by a separate short-lived container that has
 * network access but no access to the sandbox, then streamed in as a tar over
 * stdin. The host never writes the untrusted files to its own disk.
 */
import { type ChildProcessWithoutNullStreams, spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync, realpathSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const SANDBOX_LABEL = "pi.sandbox";
export const SANDBOX_USER = "10001:10001";
export const SANDBOX_WORKDIR = "/work";
const PROXY_PORT = 3128;
const DEFAULT_TTL_SECONDS = 4 * 60 * 60;
const CONTEXT_DIR = join(dirname(fileURLToPath(import.meta.url)), "container");

export type SandboxNetwork = "offline" | "web";

export interface Sandbox {
  /** Container name; tools exec into it. */
  container: string;
  network: SandboxNetwork;
  /** Proxy container (web mode only). */
  proxy: string | null;
  /** Per-sandbox internal network (web mode only). */
  networkName: string | null;
  image: string;
  /** What was copied into /work, for the orchestrator's report. */
  source: SandboxSource | null;
}

export type SandboxSource =
  | { kind: "git"; url: string }
  | { kind: "path"; path: string };

export interface DockerResult {
  code: number;
  stdout: string;
  stderr: string;
}

/** Run docker without a shell. Never throws on a non-zero exit. */
export function docker(
  args: string[],
  opts: { input?: string | Buffer; timeoutMs?: number } = {},
): Promise<DockerResult> {
  return new Promise((resolvePromise) => {
    const child = spawn("docker", args, { stdio: ["pipe", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (d) => (stdout += d));
    child.stderr.on("data", (d) => (stderr += d));
    const timer = opts.timeoutMs
      ? setTimeout(() => child.kill("SIGKILL"), opts.timeoutMs)
      : undefined;
    child.on("error", (error) => {
      if (timer) clearTimeout(timer);
      resolvePromise({ code: 127, stdout, stderr: stderr + error.message });
    });
    child.on("close", (code, signal) => {
      if (timer) clearTimeout(timer);
      resolvePromise({
        code: code ?? 128,
        stdout,
        stderr: signal ? `${stderr}killed by ${signal}` : stderr,
      });
    });
    child.stdin.end(opts.input ?? "");
  });
}

async function dockerOrThrow(
  args: string[],
  context: string,
  opts?: { input?: string | Buffer; timeoutMs?: number },
): Promise<string> {
  const result = await docker(args, opts);
  if (result.code !== 0) {
    throw new Error(`${context}: ${(result.stderr || result.stdout).trim()}`);
  }
  return result.stdout.trim();
}

/** Hardening flags shared by the sandbox, proxy, and clone containers. */
export function hardeningArgs(opts: { tmpSize?: string } = {}): string[] {
  return [
    "--user", SANDBOX_USER,
    "--cap-drop", "ALL",
    "--security-opt", "no-new-privileges",
    "--read-only",
    "--tmpfs", `/tmp:rw,nosuid,nodev,size=${opts.tmpSize ?? "512m"}`,
    "--tmpfs", "/home/sandbox:rw,nosuid,nodev,size=64m",
    "--pids-limit", "256",
    "--memory", "2g",
    "--cpus", "2",
    "--init",
    "--label", `${SANDBOX_LABEL}=1`,
  ];
}

/** Image tag derived from the build context, so edits trigger a rebuild. */
const SANDBOX_IMAGE = "pi-sandbox";

export function sandboxImageTag(contextDir = CONTEXT_DIR): string {
  const hash = createHash("sha256");
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir).sort()) {
      const full = join(dir, entry);
      if (statSync(full).isDirectory()) walk(full);
      else hash.update(`${full.slice(contextDir.length)}\0`).update(readFileSync(full));
    }
  };
  walk(contextDir);
  return `${SANDBOX_IMAGE}:${hash.digest("hex").slice(0, 12)}`;
}

export async function ensureSandboxImage(): Promise<string> {
  const tag = sandboxImageTag();
  const inspect = await docker(["image", "inspect", tag], { timeoutMs: 30_000 });
  if (inspect.code === 0) return tag;
  await dockerOrThrow(["build", "-q", "-t", tag, CONTEXT_DIR], "Building the sandbox image failed", {
    timeoutMs: 20 * 60_000,
  });
  await removeOldSandboxImages(tag);
  return tag;
}

/**
 * Each edit to container/ builds a new tag; drop the older ones. Docker
 * refuses to remove an image a running sandbox still uses, so this never
 * breaks a live subagent. Failures are ignored.
 */
async function removeOldSandboxImages(keep: string): Promise<void> {
  const list = await docker(["images", SANDBOX_IMAGE, "--format", "{{.Repository}}:{{.Tag}}"], { timeoutMs: 30_000 });
  if (list.code !== 0) return;
  const old = list.stdout.split("\n").map((t) => t.trim()).filter((t) => t && t !== keep && !t.endsWith(":<none>"));
  if (old.length > 0) await docker(["rmi", ...old], { timeoutMs: 120_000 });
}

/**
 * Accept only plain https URLs with a host and no credentials. Everything else
 * (ssh, file://, ext::, `-`-prefixed values git could read as options) is
 * refused before git sees it.
 */
export function parseGitSource(value: string): string | null {
  let url: URL;
  try {
    url = new URL(value.trim());
  } catch {
    return null;
  }
  if (url.protocol !== "https:" || !url.hostname) return null;
  if (url.username || url.password) return null;
  if (url.search || url.hash) return null;
  return url.toString();
}

export function parseSource(value: string, cwd: string): SandboxSource {
  const trimmed = value.trim();
  if (/^[a-z][a-z0-9+.-]*:/i.test(trimmed)) {
    const url = parseGitSource(trimmed);
    if (!url) {
      throw new Error(
        `Unsupported source "${trimmed}": use an https:// git URL without credentials, or a local path.`,
      );
    }
    return { kind: "git", url };
  }
  const given = resolve(cwd, trimmed);
  if (!existsSync(given)) throw new Error(`Source path does not exist: ${given}`);
  // Canonical path: on macOS "/users/me" and "/System/Volumes/Data/Users/me"
  // are the home folder too. realpath.native returns the one true spelling.
  const path = realpathSync.native(given);
  const refusal = sensitiveSourceReason(path, realpathSync.native(homedir()));
  if (refusal) {
    throw new Error(`Refusing to copy ${given} into a sandbox: ${refusal}. Pass the project folder instead.`);
  }
  return { kind: "path", path };
}

/** Folders under home that hold keys, tokens, or app data. */
const SECRET_HOME_DIRS = new Set([
  ".ssh", ".aws", ".azure", ".gnupg", ".config", ".docker", ".kube",
  ".pi", ".password-store", ".netrc", ".npmrc", "Library",
]);

/**
 * Why a canonical local path must not be copied into a sandbox, or null.
 * Copying / or the home folder (or a parent of it, or a secret folder in it)
 * would put SSH keys, API tokens, and browser data where web mode could send
 * them out.
 */
export function sensitiveSourceReason(path: string, home: string): string | null {
  if (path === "/") return "it is /";
  if (path === home || home.startsWith(`${path}/`)) return "it is or contains your home folder";
  if (path.startsWith(`${home}/`)) {
    const first = path.slice(home.length + 1).split("/")[0];
    if (SECRET_HOME_DIRS.has(first)) return `~/${first} holds credentials or app data`;
  }
  return null;
}

export function sandboxSlug(name: string, id: string): string {
  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 30);
  return `pi-sbx-${slug || "agent"}-${id}`.toLowerCase();
}

/** The `docker run` arguments for the sandbox container itself. */
export function sandboxRunArgs(opts: {
  container: string;
  image: string;
  network: SandboxNetwork;
  networkName: string | null;
  proxy: string | null;
  ttlSeconds?: number;
}): string[] {
  const args = [
    "run", "-d", "--rm",
    "--name", opts.container,
    "--hostname", "sandbox",
    ...hardeningArgs(),
    "--volume", SANDBOX_WORKDIR,
    "--workdir", SANDBOX_WORKDIR,
    "--network", opts.network === "web" ? (opts.networkName ?? "none") : "none",
  ];
  if (opts.network === "web" && opts.proxy) {
    const proxyUrl = `http://${opts.proxy}:${PROXY_PORT}`;
    for (const name of ["HTTP_PROXY", "HTTPS_PROXY", "http_proxy", "https_proxy"]) {
      args.push("--env", `${name}=${proxyUrl}`);
    }
    args.push("--env", "NO_PROXY=", "--env", "no_proxy=");
  }
  args.push(opts.image, "sleep", String(opts.ttlSeconds ?? DEFAULT_TTL_SECONDS));
  return args;
}

function formatBytes(bytes: number): string {
  return bytes >= 1024 ** 3 ? `${(bytes / 1024 ** 3).toFixed(1)} GiB` : `${Math.round(bytes / 1024 ** 2)} MiB`;
}

/** Largest source tar copied into /work, for both git and local sources. */
export const MAX_SOURCE_BYTES = 1.5 * 1024 ** 3;
const CLONE_TIMEOUT_SECONDS = 10 * 60;

/** Names of the short-lived clone container, its proxy, and its network. */
export function cloneResourceNames(container: string): { clone: string; proxy: string; network: string } {
  return { clone: `${container}-clone`, proxy: `${container}-cproxy`, network: `${container}-cnet` };
}

async function startProxy(opts: { name: string; networkName: string; image: string; ttlSeconds: number }): Promise<void> {
  await dockerOrThrow(
    ["network", "create", "--internal", "--label", `${SANDBOX_LABEL}=1`, opts.networkName],
    "Creating the sandbox network failed",
  );
  await dockerOrThrow(
    [
      "run", "-d", "--rm",
      "--name", opts.name,
      ...hardeningArgs({ tmpSize: "16m" }),
      "--network", opts.networkName,
      opts.image, "timeout", String(opts.ttlSeconds), "egress-proxy",
    ],
    "Starting the egress proxy failed",
  );
  await dockerOrThrow(["network", "connect", "bridge", opts.name], "Connecting the egress proxy failed");
}

/**
 * Stream a producer's stdout (a tar) into the sandbox's /work with
 * backpressure, so nothing is buffered on the host. Kills both sides and runs
 * `onAbort` when the stream passes `maxBytes` or `timeoutMs`.
 */
export async function streamTarIntoSandbox(opts: {
  producer: ChildProcessWithoutNullStreams;
  container: string;
  label: string;
  maxBytes: number;
  timeoutMs: number;
  onAbort?: () => Promise<void>;
}): Promise<void> {
  const { producer } = opts;
  const consumer = spawn("docker", [
    "exec", "-i", "-u", SANDBOX_USER, opts.container, "tar", "-xf", "-", "-C", SANDBOX_WORKDIR,
  ]);
  let failure: string | null = null;
  let size = 0;
  let producerErr = "";
  let consumerErr = "";
  const abort = (why: string) => {
    if (failure) return;
    failure = why;
    producer.kill("SIGKILL");
    consumer.kill("SIGKILL");
  };
  const timer = setTimeout(() => abort(`timed out after ${Math.round(opts.timeoutMs / 1000)}s`), opts.timeoutMs);
  producer.stdout.on("data", (chunk: Buffer) => {
    size += chunk.length;
    if (size > opts.maxBytes) abort(`source is larger than ${formatBytes(opts.maxBytes)}`);
  });
  producer.stdout.pipe(consumer.stdin);
  consumer.stdin.on("error", () => {}); // EPIPE after the consumer exits
  producer.stderr.on("data", (d) => (producerErr = (producerErr + d).slice(-4000)));
  consumer.stderr.on("data", (d) => (consumerErr = (consumerErr + d).slice(-4000)));
  // Wait on `exit`, not `close`: `close` also waits for stdout to hit EOF,
  // which a paused or inherited pipe may never do.
  const exit = (child: ChildProcessWithoutNullStreams) =>
    new Promise<number | null>((resolveExit) => {
      child.on("error", (error) => {
        abort(error.message);
        resolveExit(null);
      });
      child.on("exit", (code) => resolveExit(code));
    });
  const consumerDone = exit(consumer).then((code) => {
    // tar stops at the end-of-archive marker and may exit before the
    // producer does. Keep reading (and counting) so the producer cannot block
    // on a full pipe; the size cap and timer still apply.
    producer.stdout.unpipe(consumer.stdin);
    producer.stdout.resume();
    return code;
  });
  const [producerCode, consumerCode] = await Promise.all([exit(producer), consumerDone]);
  clearTimeout(timer);
  for (const stream of [producer.stdout, producer.stderr, consumer.stdin, consumer.stdout, consumer.stderr]) {
    stream.destroy();
  }
  if (failure && opts.onAbort) await opts.onAbort();
  if (failure) throw new Error(`${opts.label} failed: ${failure}`);
  if (producerCode !== 0) throw new Error(`${opts.label} failed: ${producerErr.trim() || `exit ${producerCode}`}`);
  if (consumerCode !== 0) {
    throw new Error(`${opts.label} failed: unpacking in the sandbox: ${consumerErr.trim() || `exit ${consumerCode}`}`);
  }
}

async function removeCloneResources(container: string): Promise<void> {
  const names = cloneResourceNames(container);
  await docker(["rm", "-f", "-v", names.clone, names.proxy], { timeoutMs: 60_000 });
  await docker(["network", "rm", names.network], { timeoutMs: 30_000 });
}

async function copySourceIn(sandbox: Sandbox, source: SandboxSource): Promise<void> {
  if (source.kind === "git") {
    // Clone in its own container, then stream a tar out of it. The clone
    // container sits on an internal network and reaches the git host only
    // through its own egress proxy, so the URL (and any redirect it serves)
    // cannot reach the host, the LAN, or cloud metadata.
    const names = cloneResourceNames(sandbox.container);
    try {
      await startProxy({
        name: names.proxy,
        networkName: names.network,
        image: sandbox.image,
        ttlSeconds: CLONE_TIMEOUT_SECONDS + 60,
      });
      const proxyUrl = `http://${names.proxy}:${PROXY_PORT}`;
      const producer = spawn("docker", [
        "run", "--rm", "-i",
        "--name", names.clone,
        ...hardeningArgs({ tmpSize: "2g" }),
        "--network", names.network,
        "--env", "GIT_TERMINAL_PROMPT=0",
        "--env", `HTTPS_PROXY=${proxyUrl}`,
        "--env", `https_proxy=${proxyUrl}`,
        // Give up on a server that trickles bytes.
        "--env", "GIT_HTTP_LOW_SPEED_LIMIT=1000",
        "--env", "GIT_HTTP_LOW_SPEED_TIME=60",
        sandbox.image,
        "timeout", String(CLONE_TIMEOUT_SECONDS),
        "sh", "-c",
        'git clone --quiet --depth 1 --single-branch --no-tags --no-recurse-submodules -- "$1" /tmp/repo >&2 && tar -C /tmp/repo -cf - .',
        "clone", source.url,
      ]);
      producer.stdin.end();
      await streamTarIntoSandbox({
        producer,
        container: sandbox.container,
        label: `Cloning ${source.url}`,
        maxBytes: MAX_SOURCE_BYTES,
        timeoutMs: CLONE_TIMEOUT_SECONDS * 1000,
      });
    } finally {
      // Killing the docker CLI does not stop the container; remove it by name.
      await removeCloneResources(sandbox.container);
    }
    return;
  }

  // Local path: archive it on the host without following symlinks or adding
  // macOS metadata, and unpack it as the sandbox user.
  const producer = spawn(
    "tar",
    ["--no-mac-metadata", "-cf", "-", "-C", dirname(source.path), basename(source.path)],
    { env: { ...process.env, COPYFILE_DISABLE: "1" } },
  );
  producer.stdin.end();
  await streamTarIntoSandbox({
    producer,
    container: sandbox.container,
    label: `Copying ${source.path}`,
    maxBytes: MAX_SOURCE_BYTES,
    timeoutMs: 10 * 60_000,
  });
}

/**
 * Create a sandbox and copy the source into /work. On any failure everything
 * already created is removed before the error is rethrown.
 */
export async function createSandbox(opts: {
  name: string;
  id: string;
  network: SandboxNetwork;
  source?: SandboxSource | null;
  ttlSeconds?: number;
}): Promise<Sandbox> {
  const info = await docker(["info", "--format", "{{.ServerVersion}}"], { timeoutMs: 20_000 });
  if (info.code !== 0) {
    throw new Error("Docker is not running. Start Docker Desktop and try again.");
  }
  const image = await ensureSandboxImage();
  await pruneOrphanSandboxNetworks();
  const container = sandboxSlug(opts.name, opts.id);
  const sandbox: Sandbox = {
    container,
    network: opts.network,
    proxy: opts.network === "web" ? `${container}-proxy` : null,
    networkName: opts.network === "web" ? `${container}-net` : null,
    image,
    source: opts.source ?? null,
  };

  try {
    if (sandbox.networkName && sandbox.proxy) {
      await startProxy({
        name: sandbox.proxy,
        networkName: sandbox.networkName,
        image,
        ttlSeconds: opts.ttlSeconds ?? DEFAULT_TTL_SECONDS,
      });
    }

    await dockerOrThrow(
      sandboxRunArgs({ ...sandbox, ttlSeconds: opts.ttlSeconds }),
      "Starting the sandbox container failed",
      { timeoutMs: 60_000 },
    );
    if (sandbox.source) await copySourceIn(sandbox, sandbox.source);
    return sandbox;
  } catch (error) {
    await destroySandbox(sandbox);
    throw error;
  }
}

/** Remove the sandbox, its proxy, and its network. Idempotent; never throws. */
export async function destroySandbox(sandbox: Pick<Sandbox, "container" | "proxy" | "networkName">): Promise<void> {
  const { containers, networks } = sandboxResources(sandbox);
  await docker(["rm", "-f", "-v", ...containers], { timeoutMs: 60_000 });
  await docker(["network", "rm", ...networks], { timeoutMs: 30_000 });
}

/** Every container and network a sandbox may own, including a clone in progress. */
export function sandboxResources(sandbox: Pick<Sandbox, "container" | "proxy" | "networkName">): {
  containers: string[];
  networks: string[];
} {
  const clone = cloneResourceNames(sandbox.container);
  return {
    containers: [sandbox.container, sandbox.proxy, clone.clone, clone.proxy].filter((c): c is string => !!c),
    networks: [sandbox.networkName, clone.network].filter((n): n is string => !!n),
  };
}

/**
 * Remove the sandbox in a detached process that outlives this one, for close
 * paths that cannot await (window close, pi shutdown). Never throws.
 */
export function destroySandboxDetached(sandbox: Pick<Sandbox, "container" | "proxy" | "networkName">): void {
  const { containers, networks } = sandboxResources(sandbox);
  // $NETS holds names matching sandboxSlug's [a-z0-9-] alphabet, so word
  // splitting is safe.
  const script = 'docker rm -f -v "$@" >/dev/null 2>&1; docker network rm $NETS >/dev/null 2>&1';
  try {
    const child = spawn("sh", ["-c", script, "pi-sandbox-rm", ...containers], {
      detached: true,
      stdio: "ignore",
      env: { PATH: process.env.PATH ?? "/usr/bin:/bin", HOME: process.env.HOME ?? "", NETS: networks.join(" ") },
    });
    child.on("error", () => {});
    child.unref();
  } catch {
    // The container TTL removes it later.
  }
}

/**
 * Remove sandbox networks left behind by a crash (containers expire by TTL).
 * Docker only prunes networks with no containers attached; the age filter
 * keeps it from racing a sandbox that is being created right now.
 */
export async function pruneOrphanSandboxNetworks(): Promise<void> {
  await docker(
    ["network", "prune", "-f", "--filter", `label=${SANDBOX_LABEL}=1`, "--filter", "until=10m"],
    { timeoutMs: 30_000 },
  );
}

export async function sandboxIsRunning(container: string): Promise<boolean> {
  const result = await docker(["inspect", "-f", "{{.State.Running}}", container], { timeoutMs: 15_000 });
  return result.code === 0 && result.stdout.trim() === "true";
}

/** One-line description for the orchestrator. */
export function describeSandbox(sandbox: Sandbox): string {
  const source = !sandbox.source
    ? "no source"
    : sandbox.source.kind === "git"
      ? sandbox.source.url
      : sandbox.source.path;
  const network = sandbox.network === "web" ? "web via filtering proxy" : "offline";
  return `container ${sandbox.container} (${network}; ${source} in ${SANDBOX_WORKDIR})`;
}
