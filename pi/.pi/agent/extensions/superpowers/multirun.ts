/**
 * Saved multi-model runs for /plan and /review.
 *
 * Each run keeps every model's Pi session, system prompt and output in
 * ~/.pi/multi-runs/<id>/ (local, gitignored), so one model can be asked a
 * follow-up later with its full context: plan_followup / review_followup.
 */
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { pickLatestRun } from "./_async.js";
import { type AgentResult, runAgent } from "./_shared.js";

export type RunKind = "plan" | "review";

export interface RunMember {
  key: string;
  label: string;
  model: string;
  thinking?: string;
  tools: string;
  /** Pi session file; resumed by follow-ups. */
  sessionFile: string;
  /** System prompt, re-sent on every follow-up. */
  promptFile: string;
  /** Latest output (plan or review) from this model. */
  outputFile: string;
  status: "running" | "done" | "error";
  /** Why the last run ended badly, e.g. "killed: no output for 240s"; for diagnosis. */
  failure?: string;
  followups: number;
}

/**
 * Time limits for a planner or reviewer (initial run and follow-ups).
 * Big plans are one long `write` call: Opus at high thinking streams for 5+ minutes,
 * so a 6-minute wall clock killed it mid-write. The idle limit catches a hung model;
 * the hard cap only bounds cost.
 */
export const MEMBER_LIMITS = {
  timeoutMs: 20 * 60_000,
  idleTimeoutMs: 4 * 60_000,
} as const;

export interface SettledOutput {
  /** Text to show: the written file, else stdout (possibly partial), else "". */
  output: string;
  status: "done" | "error";
  failure?: string;
}

/**
 * Decide a member's result from its output file and process result.
 * A file the agent wrote is complete (the write tool writes it in one call), so it
 * counts even when the process was killed afterwards. Stdout counts only on a clean
 * exit: after a kill it is a truncated message. Stdout is saved to `file` when the
 * agent wrote nothing, so the text stays inspectable.
 */
export function settleOutput(
  file: string,
  result: Pick<AgentResult, "output" | "exitCode" | "timedOut">,
  limits: { timeoutMs: number; idleTimeoutMs?: number } = MEMBER_LIMITS,
): SettledOutput {
  const failure = describeFailure(result, limits);
  const written = readOutput(file);
  if (written) return { output: written, status: "done" };
  const stdout = result.output?.trim() ?? "";
  if (stdout) fs.writeFileSync(file, stdout, "utf-8");
  if (stdout && result.exitCode === 0)
    return { output: stdout, status: "done" };
  return {
    output: stdout,
    status: "error",
    failure: failure ?? (stdout ? `exit code ${result.exitCode}` : "no output"),
  };
}

function describeFailure(
  result: Pick<AgentResult, "exitCode" | "timedOut">,
  limits: { timeoutMs: number; idleTimeoutMs?: number },
): string | undefined {
  if (result.timedOut === "idle")
    return `killed: no output for ${Math.round((limits.idleTimeoutMs ?? 0) / 1000)}s`;
  if (result.timedOut === "hard")
    return `killed: hit the ${Math.round(limits.timeoutMs / 60_000)} min cap`;
  return undefined;
}

export interface MultiRun {
  id: string;
  kind: RunKind;
  task: string;
  cwd: string;
  createdAt: string;
  /** When the combined result reached the main agent; follow-ups default to the latest. */
  deliveredAt?: string;
  members: RunMember[];
}

export const MAX_RUNS = 20;

export function runsRoot(): string {
  return (
    process.env.PI_MULTI_RUNS_DIR ||
    path.join(os.homedir(), ".pi", "multi-runs")
  );
}

function manifestPath(dir: string): string {
  return path.join(dir, "run.json");
}

/** Create a run directory (and prune old runs). */
export function createRun(
  kind: RunKind,
  task: string,
  cwd: string,
  now = new Date(),
): MultiRun {
  const root = runsRoot();
  fs.mkdirSync(root, { recursive: true });
  const stamp = now
    .toISOString()
    .replace(/[-:]/g, "")
    .replace(/\.\d+Z$/, "")
    .replace("T", "-");
  let id = `${stamp}-${kind}`;
  for (let i = 2; fs.existsSync(path.join(root, id)); i++)
    id = `${stamp}-${kind}-${i}`;
  fs.mkdirSync(path.join(root, id));
  pruneRuns(root);
  return { id, kind, task, cwd, createdAt: now.toISOString(), members: [] };
}

export function runDir(id: string): string {
  return path.join(runsRoot(), id);
}

/** Register a member: writes its system prompt and returns its file paths. */
export function addMember(
  run: MultiRun,
  member: {
    key: string;
    label: string;
    model: string;
    thinking?: string;
    tools: string;
    prompt: string;
  },
): RunMember {
  const dir = runDir(run.id);
  const base = `${run.kind}-${member.key.toLowerCase()}`;
  const promptFile = path.join(dir, `${base}.prompt.md`);
  fs.writeFileSync(promptFile, member.prompt, "utf-8");
  const entry: RunMember = {
    key: member.key,
    label: member.label,
    model: member.model,
    ...(member.thinking ? { thinking: member.thinking } : {}),
    tools: member.tools,
    sessionFile: path.join(dir, `${base}.session.jsonl`),
    promptFile,
    outputFile: path.join(dir, `${base}.md`),
    status: "running",
    followups: 0,
  };
  run.members.push(entry);
  return entry;
}

export function saveRun(run: MultiRun): void {
  fs.writeFileSync(manifestPath(runDir(run.id)), JSON.stringify(run, null, 2));
}

export function loadRun(id: string): MultiRun | undefined {
  try {
    return JSON.parse(
      fs.readFileSync(manifestPath(runDir(id)), "utf-8"),
    ) as MultiRun;
  } catch {
    return undefined;
  }
}

/** Run ids, newest first. */
export function listRunIds(root = runsRoot()): string[] {
  try {
    return fs
      .readdirSync(root)
      .filter(
        (d) =>
          fs.existsSync(manifestPath(path.join(root, d))) ||
          fs.statSync(path.join(root, d)).isDirectory(),
      )
      .sort()
      .reverse();
  } catch {
    return [];
  }
}

/** Most recently delivered run of a kind, preferring one started in `cwd`. */
export function latestRun(kind: RunKind, cwd?: string): MultiRun | undefined {
  const runs: MultiRun[] = [];
  for (const id of listRunIds()) {
    const run = loadRun(id);
    if (run) runs.push(run);
  }
  return pickLatestRun(runs, kind, cwd);
}

/** Record that the run's combined result reached the main agent. */
export function markDelivered(run: MultiRun, now = new Date()): void {
  run.deliveredAt = now.toISOString();
  saveRun(run);
}

function pruneRuns(root: string): void {
  for (const id of listRunIds(root).slice(MAX_RUNS)) {
    fs.rmSync(path.join(root, id), { recursive: true, force: true });
  }
}

export function readOutput(file: string): string {
  try {
    return fs.existsSync(file) ? fs.readFileSync(file, "utf-8").trim() : "";
  } catch {
    return "";
  }
}

export interface FollowupResult {
  run: MultiRun;
  member: RunMember;
  output: string;
  ok: boolean;
}

/**
 * Continue one model's session with a new message. Its updated output is
 * written to <kind>-<key>-<n>.md and becomes the member's latest output.
 */
export async function runFollowup(opts: {
  kind: RunKind;
  key: string;
  message: string;
  runId?: string;
  cwd: string;
  signal?: AbortSignal;
  timeoutMs?: number;
  onActivity?: (activity: string) => void;
  /** Called once the run and member are resolved; may return the signal to run under instead of `signal`. */
  onStart?: (run: MultiRun, member: RunMember) => AbortSignal | undefined;
}): Promise<FollowupResult> {
  const run = opts.runId ? loadRun(opts.runId) : latestRun(opts.kind, opts.cwd);
  if (!run || run.kind !== opts.kind) {
    throw new Error(
      `No saved ${opts.kind} run${opts.runId ? ` with id ${opts.runId}` : ""}. Run /${opts.kind} first.`,
    );
  }
  const member = run.members.find(
    (m) => m.key.toUpperCase() === opts.key.toUpperCase(),
  );
  if (!member) {
    throw new Error(
      `Run ${run.id} has no ${opts.kind} ${opts.key}. Available: ${run.members.map((m) => m.key).join(", ")}.`,
    );
  }
  if (!fs.existsSync(member.sessionFile)) {
    throw new Error(
      `${opts.kind} ${member.key} (${member.label}) has no saved session to resume.`,
    );
  }

  const signal = opts.onStart?.(run, member) ?? opts.signal;
  const n = member.followups + 1;
  const outputFile = path.join(
    runDir(run.id),
    `${run.kind}-${member.key.toLowerCase()}-${n}.md`,
  );
  const noun = run.kind === "plan" ? "plan" : "review";
  const result = await runAgent({
    cwd: run.cwd,
    model: member.model,
    systemPrompt: fs.readFileSync(member.promptFile, "utf-8"),
    tools: member.tools,
    task: `${opts.message}\n\n## Output File\nWrite your FULL updated ${noun} (or your answer, if no ${noun} change is needed) to: ${outputFile}`,
    ...(member.thinking ? { thinking: member.thinking } : {}),
    sessionFile: member.sessionFile,
    timeoutMs: opts.timeoutMs ?? MEMBER_LIMITS.timeoutMs,
    idleTimeoutMs: MEMBER_LIMITS.idleTimeoutMs,
    signal,
    onActivity: opts.onActivity,
  });

  const settled = settleOutput(outputFile, result, {
    timeoutMs: opts.timeoutMs ?? MEMBER_LIMITS.timeoutMs,
    idleTimeoutMs: MEMBER_LIMITS.idleTimeoutMs,
  });
  const ok = settled.status === "done";
  if (ok) {
    member.outputFile = outputFile;
    member.followups = n;
    member.status = "done";
    delete member.failure;
  } else {
    member.failure = settled.failure;
  }
  saveRun(run);
  return {
    run,
    member,
    output: settled.output || `(no output: ${settled.failure})`,
    ok,
  };
}

/** Footer added to /plan and /review results. */
export function followupHint(run: MultiRun): string {
  const tool = run.kind === "plan" ? "plan_followup" : "review_followup";
  const keys = run.members.filter((m) => m.status === "done").map((m) => m.key);
  if (!keys.length) return "";
  return `\n_Saved as run \`${run.id}\`. To continue one model with its full context: ${tool}({ run: "${run.id}", key: "${keys[0]}", message: "…" }) — keys: ${keys.join(", ")}. Omitting \`run\` targets the most recently delivered run._\n`;
}
