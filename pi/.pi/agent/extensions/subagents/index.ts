// @ts-nocheck -- vendored upstream extension; runtime compatibility is covered by fork tests.
// biome-ignore-all lint/suspicious/noExplicitAny: upstream extension uses dynamic Pi event payloads.
// biome-ignore-all lint/correctness/noUnusedVariables: upstream keeps renderer constants for compatibility.
import type {
  ExtensionAPI,
  ExtensionContext,
} from "@earendil-works/pi-coding-agent";
import { keyHint } from "@earendil-works/pi-coding-agent";
import { Type, type Static } from "@sinclair/typebox";
import {
  Box,
  Text,
  truncateToWidth,
  visibleWidth,
} from "@earendil-works/pi-tui";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  readdirSync,
  readFileSync,
  writeFileSync,
  existsSync,
  mkdirSync,
  copyFileSync,
  unlinkSync,
} from "node:fs";
import { homedir } from "node:os";
import {
  isMuxAvailable,
  muxSetupHint,
  createSurface,
  sendCommand,
  sendLongCommand,
  pollForExit,
  closeSurface,
  attachSurface,
  surfaceAlive,
  shellEscape,
  readScreen,
  wrapSubagentCommand,
  exitStatusFile,
} from "./tmux.ts";
import { discoverSkillCandidates } from "./skill-discovery.ts";
import { buildSubagentTaskMessage } from "./task-prompt.ts";
import {
  renderSkillBlocks,
  resolveRequestedSkills,
  type SkillCandidate,
} from "./skill-injection.ts";
import {
  allocateSubagentWorktree,
  describeWorktreeRelease,
  reattachSubagentWorktree,
  releaseSubagentWorktree,
  type SubagentWorktree,
  type WorktreeRelease,
} from "./worktree-isolation.ts";
import {
  createSandbox,
  describeSandbox,
  destroySandbox,
  destroySandboxDetached,
  parseSource,
  type Sandbox,
  type SandboxNetwork,
  type SandboxSource,
} from "./container-isolation.ts";
import {
  CONTAINER_CHILD_FLAGS,
  CONTAINER_TOOLS,
  CONTAINER_TOOLS_EXTENSION,
  checkContainerSpawn,
  containerChildEnv,
  profileNeedsContainer,
  containerToolAllowlist,
  sandboxBriefing,
} from "./container-launch.ts";
import {
  consumeTurnSignal,
  loadKeepAliveConfig,
  resolveKeepAlive,
  shouldIdleClose,
  type KeepAliveConfig,
} from "./keep-alive.ts";

import {
  countSessionEntryLines,
  findLastAssistantMessage,
  getNewEntries,
  getSessionId,
  readNameRegistry,
  readSubagentLoadout,
  registerName,
  resolveNameInRegistry,
  seedSubagentSessionFile,
  summarizeSessionStats,
  writeSubagentLoadout,
  type SessionStats,
  type SubagentLoadout,
} from "./session.ts";
import {
  type StatusSnapshot,
  type SubagentStatusState,
  advanceStatusState,
  capStatusLines,
  classifyStatus,
  createStatusState,
  forceStatusAfterInterrupt,
  formatStatusAggregate,
  formatTransitionLine,
  observeStatus,
  loadStatusConfig,
} from "./status.ts";
import {
  getSubagentActivityFile,
  readSubagentActivityFile,
  type ActivityReadResult,
  type SubagentActivityState,
} from "./activity.ts";

/** Absolute path to `pi-extension/subagents`. https://github.com/nodejs/node/issues/37845 */
const SUBAGENTS_DIR = dirname(fileURLToPath(import.meta.url));

// Survive /reload: clear timers and abort poll loops from the previous module load.
// /reload re-imports this file, giving fresh module-level state, but closures from
// the old module keep running. See https://github.com/HazAT/pi-interactive-subagents/issues/5
const WIDGET_INTERVAL_KEY = Symbol.for("pi-subagents/widget-interval");
const STATUS_INTERVAL_KEY = Symbol.for("pi-subagents/status-interval");
const POLL_ABORT_KEY = Symbol.for("pi-subagents/poll-abort-controller");

{
  const prevInterval = (globalThis as any)[WIDGET_INTERVAL_KEY];
  if (prevInterval) {
    clearInterval(prevInterval);
    (globalThis as any)[WIDGET_INTERVAL_KEY] = null;
  }
  const prevStatusInterval = (globalThis as any)[STATUS_INTERVAL_KEY];
  if (prevStatusInterval) {
    clearInterval(prevStatusInterval);
    (globalThis as any)[STATUS_INTERVAL_KEY] = null;
  }
  const prevAbort = (globalThis as any)[POLL_ABORT_KEY] as
    | AbortController
    | undefined;
  if (prevAbort) prevAbort.abort();
  (globalThis as any)[POLL_ABORT_KEY] = new AbortController();
}

function getModuleAbortSignal(): AbortSignal {
  return ((globalThis as any)[POLL_ABORT_KEY] as AbortController).signal;
}

const SubagentParams = Type.Object({
  task: Type.String({
    description: "Task for the subagent. Include concrete acceptance criteria.",
  }),
  context: Type.Optional(
    Type.String({
      description:
        "Curated context selected by the orchestrator. The child does not inherit the full conversation by default.",
    }),
  ),
  name: Type.Optional(
    Type.String({
      description:
        "Stable task-oriented handle used for its tmux window, messages, attach, and resume. Defaults to a task slug.",
    }),
  ),
  profile: Type.Optional(
    Type.String({
      description:
        "Capability profile: general (default), explore, research, review, or implement.",
    }),
  ),
  agent: Type.Optional(
    Type.String({ description: "Deprecated alias for profile." }),
  ),
  model: Type.Optional(
    Type.String({ description: "Model override (overrides profile default)." }),
  ),
  skills: Type.Optional(
    Type.Array(
      Type.Union([
        Type.String({ description: "Skill name; uses the skill Pi loads." }),
        Type.Object({
          name: Type.String({ description: "Exact skill name." }),
          scope: Type.Optional(
            Type.Union([Type.Literal("global"), Type.Literal("local")], {
              description:
                "global uses user-level skills; local uses the orchestrator project's skills.",
            }),
          ),
        }),
      ]),
      {
        description:
          'Skills to inject into the child\'s first prompt. Use "principles" for Pi\'s active skill, or { name: "principles", scope: "global" | "local" } to choose a source. Pick skills that change how the child should work; profile skills still load.',
      },
    ),
  ),
  cwd: Type.Optional(
    Type.String({
      description:
        "Child working directory. Relative paths resolve from the caller cwd.",
    }),
  ),
  isolation: Type.Optional(
    Type.Union(
      [
        Type.Literal("shared"),
        Type.Literal("worktree"),
        Type.Literal("container"),
      ],
      {
        description:
          "shared (default) runs in the caller's cwd. worktree runs in a new git worktree at <repo>/.pi/git-worktrees/<name-slug> on a new branch (see branch). " +
          "On close the worktree is removed if clean; if it has uncommitted or untracked files it is kept and the close result says so. The branch is never deleted. " +
          "container runs the child against a disposable Docker sandbox for untrusted code or sites (needs Docker): its only tools are sandbox_bash/sandbox_read/sandbox_ls inside the container, with no host files, secrets, MCP, or AGENTS.md. Pass the code as source and pick network. Use profile audit. The container is removed on close.",
      },
    ),
  ),
  source: Type.Optional(
    Type.String({
      description:
        'Container isolation only. What to copy into the sandbox\'s /work: an https:// git URL (https://github.com/owner/repo) cloned shallow without submodules in a separate throwaway container, or a local project folder copied to /work/<folder-name> without following symlinks (/ and folders containing your home folder are refused). Omit for an empty /work (e.g. to inspect a website with network: "web").',
    }),
  ),
  network: Type.Optional(
    Type.Union([Type.Literal("offline"), Type.Literal("web")], {
      description:
        'Container isolation only. offline (default): no network at all. web: HTTP(S) to public hosts through a filtering proxy that blocks private, local, and cloud-metadata addresses; the child gets web-fetch, web-search, and web-shot (screenshots). Use web only when the task needs the internet, since a hijacked child could send what it read to a public host.',
    }),
  ),
  branch: Type.Optional(
    Type.String({
      description:
        "Worktree isolation only. Existing branch (or other commit-ish): the worktree starts at its tip on a NEW branch named after the subagent's name slug; the given branch is not checked out or moved. " +
        "Branch that does not exist: it is created from the main checkout's HEAD and checked out in the worktree. " +
        "Omitted: a branch named after the name slug is created from HEAD. An existing branch is never reset; a name collision is an error.",
    }),
  ),
  keepAlive: Type.Optional(
    Type.Boolean({
      description:
        "Keep the subagent open after it delivers each result, so you can send follow-up work with subagent_message and close it with subagent_close. Defaults to true. Set false for a one-shot run that closes itself when done.",
    }),
  ),
});

type SubagentSessionMode = "standalone" | "lineage-only" | "fork";

interface AgentDefaults {
  model?: string;
  tools?: string;
  skills?: string;
  thinking?: string;
  /**
   * If set (non-empty), this agent is granted the full subagent spawning
   * toolset and may only spawn the listed agents. Presence of this field —
   * not the `tools` list — is what grants spawning. Enforced in the child via
   * the PI_SUBAGENT_ALLOWED env var.
   */
  subagentAgents?: string[];
  autoExit?: boolean;
  interactive?: boolean;
  systemPromptMode?: "append" | "replace";
  sessionMode?: SubagentSessionMode;
  cwd?: string;
  cli?: string;
  body?: string;
  disableModelInvocation?: boolean;
}

type AgentSource = "package" | "global" | "project";

interface AgentDefinition extends AgentDefaults {
  name: string;
  description?: string;
  disableModelInvocation: boolean;
}

interface ListedAgentDefinition extends AgentDefinition {
  source: AgentSource;
}

/**
 * The full subagent lifecycle/spawning toolset registered by this extension.
 * An agent is granted these (and this extension is loaded into its child
 * process) only when its frontmatter declares a non-empty `subagent_agents`.
 */
const SPAWNING_TOOLS = [
  "subagent",
  "subagent_message",
  "subagent_close",
  "subagents_list",
] as const;

/** Built-in tools pi provides natively — no extension needs to be loaded. */
const BUILTIN_TOOLS = new Set([
  "read",
  "write",
  "edit",
  "bash",
  "ls",
  "ask_question",
]);

/** Resolve the global agent config directory, respecting PI_CODING_AGENT_DIR. */
function getAgentConfigDir(): string {
  return process.env.PI_CODING_AGENT_DIR ?? join(homedir(), ".pi", "agent");
}

// ── Runtime tool-extension registration ─────────────────────────────────────
// `getToolExtensionPath` otherwise only knows a closed set of tool names. Other
// pi extensions that bundle a tool for subagents (e.g. a project-local
// extension exposing a bespoke tool) register its name → extension-file path
// here at load/session_start time so a child process can be launched with
// `--no-extensions` + an explicit `-e <path>` for it. Mirrors the legacy
// `subagents` extension's `registerToolExtension` hook.
const EXTRA_TOOL_EXTENSIONS = new Map<string, string>();

/** Register (or re-register) a custom tool's backing extension file. */
export function registerToolExtension(
  name: string,
  extensionPath: string,
): void {
  if (BUILTIN_TOOLS.has(name)) {
    throw new Error(
      `Cannot register custom tool "${name}": shadows a built-in pi tool`,
    );
  }
  if ((SPAWNING_TOOLS as readonly string[]).includes(name)) {
    throw new Error(
      `Cannot register custom tool "${name}": shadows a spawning tool`,
    );
  }
  const existing = EXTRA_TOOL_EXTENSIONS.get(name);
  if (existing === extensionPath) return; // idempotent / reload-safe
  if (existing !== undefined) {
    throw new Error(
      `Tool extension already registered for "${name}": ${existing} (refusing to overwrite with ${extensionPath})`,
    );
  }
  EXTRA_TOOL_EXTENSIONS.set(name, extensionPath);
}

// Expose registration on a process-global so project-local extensions loaded
// via jiti (separate module instances) can reach this shared map. Set at module
// load so it's available before any `session_start` listener runs.
(globalThis as any).__pi_interactive_subagents = {
  registerToolExtension,
};

/**
 * Map a custom (non-built-in) tool name to the pi-extension file that
 * registers it. Used to build the child's `--extension` whitelist after
 * `--no-extensions` disables global discovery. Returns undefined for built-in
 * tools and for unknown names (which simply won't be granted).
 */
function getToolExtensionPath(tool: string): string | undefined {
  if (BUILTIN_TOOLS.has(tool)) return undefined;
  // The four spawning tools are registered by THIS extension.
  if ((SPAWNING_TOOLS as readonly string[]).includes(tool)) {
    return fileURLToPath(import.meta.url);
  }
  const agentDir = getAgentConfigDir();
  const researchTools = join(
    SUBAGENTS_DIR,
    "child-extensions",
    "research-tools.ts",
  );
  const fff = join(
    agentDir,
    "npm",
    "node_modules",
    "@ff-labs",
    "pi-fff",
    "src",
    "index.ts",
  );
  const lens = join(
    agentDir,
    "npm",
    "node_modules",
    "pi-lens",
    "dist",
    "index.js",
  );
  const map: Record<string, string> = {
    web_search: researchTools,
    web_read: researchTools,
    qmd_search: researchTools,
    qmd_query: researchTools,
    qmd_get: researchTools,
    ffgrep: fff,
    fffind: fff,
    lens_diagnostics: lens,
    symbol_search: lens,
    project_report: lens,
    module_report: lens,
    read_symbol: lens,
    read_enclosing: lens,
    pi_lens_activate_tools: lens,
    safe_bash: join(SUBAGENTS_DIR, "tools", "safe-bash.ts"),
    ...Object.fromEntries(
      CONTAINER_TOOLS.map((name) => [name, CONTAINER_TOOLS_EXTENSION]),
    ),
  };
  // Prefer the built-in path, but fall back to a runtime-registered extension
  // when that path no longer exists on disk (e.g. a built-in tool extension
  // was disabled/removed but a project-local extension re-registered it).
  const builtin = map[tool];
  if (builtin && existsSync(builtin)) return builtin;
  return EXTRA_TOOL_EXTENSIONS.get(tool);
}

/**
 * When this process was spawned as a restricted subagent, the parent pins the
 * set of agents it may itself spawn via PI_SUBAGENT_ALLOWED. `null` means no
 * restriction (top-level session, or an unrestricted child).
 */
const SUBAGENT_ALLOWLIST: Set<string> | null = (() => {
  const raw = process.env.PI_SUBAGENT_ALLOWED;
  if (!raw) return null;
  const list = raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  return list.length > 0 ? new Set(list) : null;
})();

function getBundledAgentsDir(): string {
  return join(SUBAGENTS_DIR, "agents");
}

function getFrontmatterValue(
  frontmatter: string,
  key: string,
): string | undefined {
  const match = frontmatter.match(new RegExp(`^${key}:\\s*(.+)$`, "m"));
  return match ? match[1].trim() : undefined;
}

function parseOptionalBoolean(value: string | undefined): boolean | undefined {
  return value != null ? value === "true" : undefined;
}

/** Parse a comma-separated frontmatter value into a trimmed list (or undefined). */
function parseCommaList(value: string | undefined): string[] | undefined {
  if (value == null) return undefined;
  const list = value
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  return list.length > 0 ? list : undefined;
}

function parseSessionMode(
  value: string | undefined,
): SubagentSessionMode | undefined {
  if (value === "standalone" || value === "lineage-only" || value === "fork") {
    return value;
  }
  return undefined;
}

function parseAgentDefinition(
  content: string,
  fallbackName: string,
): AgentDefinition | null {
  const match = content.match(/^---\n([\s\S]*?)\n---/);
  if (!match) return null;

  const frontmatter = match[1];
  const body = content.replace(/^---\n[\s\S]*?\n---\n*/, "").trim();
  const systemPromptMode = getFrontmatterValue(frontmatter, "system-prompt");

  return {
    name: getFrontmatterValue(frontmatter, "name") ?? fallbackName,
    description: getFrontmatterValue(frontmatter, "description"),
    model: getFrontmatterValue(frontmatter, "model"),
    tools: getFrontmatterValue(frontmatter, "tools"),
    systemPromptMode:
      systemPromptMode === "replace"
        ? "replace"
        : systemPromptMode === "append"
          ? "append"
          : undefined,
    skills:
      getFrontmatterValue(frontmatter, "skill") ??
      getFrontmatterValue(frontmatter, "skills"),
    thinking: getFrontmatterValue(frontmatter, "thinking"),
    subagentAgents: parseCommaList(
      getFrontmatterValue(frontmatter, "subagent_agents"),
    ),
    autoExit: parseOptionalBoolean(
      getFrontmatterValue(frontmatter, "auto-exit"),
    ),
    interactive: parseOptionalBoolean(
      getFrontmatterValue(frontmatter, "interactive"),
    ),
    sessionMode: parseSessionMode(
      getFrontmatterValue(frontmatter, "session-mode"),
    ),
    cwd: getFrontmatterValue(frontmatter, "cwd"),
    cli: getFrontmatterValue(frontmatter, "cli"),
    body: body || undefined,
    disableModelInvocation:
      getFrontmatterValue(
        frontmatter,
        "disable-model-invocation",
      )?.toLowerCase() === "true",
  };
}

function discoverAgentDefinitions(): ListedAgentDefinition[] {
  const agents = new Map<string, ListedAgentDefinition>();
  const dirs: Array<{ path: string; source: AgentSource }> = [
    { path: getBundledAgentsDir(), source: "package" },
    { path: join(getAgentConfigDir(), "agents"), source: "global" },
    { path: join(process.cwd(), ".pi", "agents"), source: "project" },
  ];

  for (const { path: dir, source } of dirs) {
    if (!existsSync(dir)) continue;
    for (const file of readdirSync(dir).filter((entry) =>
      entry.endsWith(".md"),
    )) {
      const parsed = parseAgentDefinition(
        readFileSync(join(dir, file), "utf8"),
        file.replace(/\.md$/, ""),
      );
      if (!parsed) continue;
      agents.set(parsed.name, { ...parsed, source });
    }
  }

  // When this process is itself a restricted subagent, only expose the agents
  // it is permitted to spawn (PI_SUBAGENT_ALLOWED). Top-level sessions see all.
  const all = [...agents.values()];
  return SUBAGENT_ALLOWLIST
    ? all.filter((a) => SUBAGENT_ALLOWLIST.has(a.name))
    : all;
}

function resolveSubagentPaths(
  params: Static<typeof SubagentParams>,
  agentDefs: AgentDefaults | null,
): {
  effectiveCwd: string | null;
  localAgentDir: string | null;
  effectiveAgentDir: string;
} {
  const rawCwd = params.cwd ?? agentDefs?.cwd ?? null;
  const cwdIsFromAgent = !params.cwd && agentDefs?.cwd != null;
  const cwdBase = cwdIsFromAgent ? getAgentConfigDir() : process.cwd();
  const effectiveCwd = rawCwd
    ? rawCwd.startsWith("/")
      ? rawCwd
      : join(cwdBase, rawCwd)
    : null;
  const localAgentDir = effectiveCwd
    ? join(effectiveCwd, ".pi", "agent")
    : null;
  const effectiveAgentDir =
    localAgentDir && existsSync(localAgentDir)
      ? localAgentDir
      : getAgentConfigDir();
  return { effectiveCwd, localAgentDir, effectiveAgentDir };
}

function getDefaultSessionDirFor(cwd: string, agentDir: string): string {
  const safePath = `--${cwd.replace(/^[/\\]/, "").replace(/[/\\:]/g, "-")}--`;
  const sessionDir = join(agentDir, "sessions", safePath);
  if (!existsSync(sessionDir)) {
    mkdirSync(sessionDir, { recursive: true });
  }
  return sessionDir;
}

function resolveEffectiveSessionMode(
  params: Static<typeof SubagentParams>,
  agentDefs: AgentDefaults | null,
): SubagentSessionMode {
  return agentDefs?.sessionMode ?? "standalone";
}

function resolveLaunchBehavior(
  params: Static<typeof SubagentParams>,
  agentDefs: AgentDefaults | null,
): {
  sessionMode: SubagentSessionMode;
  seededSessionMode: "lineage-only" | "fork" | null;
  inheritsConversationContext: boolean;
  taskDelivery: "direct" | "artifact";
} {
  const sessionMode = resolveEffectiveSessionMode(params, agentDefs);
  const inheritsConversationContext = sessionMode === "fork";
  return {
    sessionMode,
    seededSessionMode: sessionMode === "standalone" ? null : sessionMode,
    inheritsConversationContext,
    taskDelivery: inheritsConversationContext ? "direct" : "artifact",
  };
}

/**
 * Decide whether a subagent is interactive (user-driven, long-running).
 *
 * Resolution order:
 *   1. Explicit `interactive` frontmatter field on the agent.
 *   2. Default: the inverse of `auto-exit`. Agents that auto-exit are
 *      autonomous (scout, researcher) and the parent session should be
 *      woken on stall/recovery transitions. Agents that don't auto-exit are
 *      driven by the user in their own pane (worker) and stall pings are noise.
 */
function resolveEffectiveInteractive(
  _params: Static<typeof SubagentParams>,
  agentDefs: AgentDefaults | null,
): boolean {
  if (agentDefs?.interactive != null) return agentDefs.interactive;
  return !(agentDefs?.autoExit ?? false);
}

function loadAgentDefaults(agentName: string): AgentDefaults | null {
  const configDir = getAgentConfigDir();
  const paths = [
    join(process.cwd(), ".pi", "agents", `${agentName}.md`),
    join(configDir, "agents", `${agentName}.md`),
    join(getBundledAgentsDir(), `${agentName}.md`),
  ];

  for (const p of paths) {
    if (!existsSync(p)) continue;
    const parsed = parseAgentDefinition(readFileSync(p, "utf8"), agentName);
    if (parsed) return parsed;
  }

  return null;
}

function formatElapsed(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}m ${s}s`;
}

/** Compact token count: 850, 3.2k, 45k. */
function formatTokens(n: number): string {
  return n < 1000
    ? String(n)
    : n < 10000
      ? `${(n / 1000).toFixed(1)}k`
      : `${Math.round(n / 1000)}k`;
}

/**
 * Known context-window sizes by model id substring, used for the context-usage
 * gauge. Unknown models fall back to a window-less "Nk ctx" label.
 */
function contextWindowFor(
  model: string | null | undefined,
): number | undefined {
  if (!model) return undefined;
  const m = model.toLowerCase();
  if (m.includes("claude")) return 200_000;
  if (m.includes("gpt-4.1") || m.includes("gpt-4o")) return 128_000;
  if (m.includes("gemini")) return 1_000_000;
  return undefined;
}

/** Context-usage gauge: "18.0%/200k" when window known, else "37k ctx". */
function formatContextUsage(
  tokens: number,
  contextWindow: number | undefined,
): string {
  if (!contextWindow) return `${formatTokens(tokens)} ctx`;
  const pct = (tokens / contextWindow) * 100;
  const maxStr =
    contextWindow >= 1_000_000
      ? `${(contextWindow / 1_000_000).toFixed(1)}M`
      : `${Math.round(contextWindow / 1000)}k`;
  return `${pct.toFixed(1)}%/${maxStr}`;
}

/**
 * Build the dim usage line for a completed subagent, mirroring the format of
 * the in-process subagents extension: "↑in ↓out R… W… $cost · ctx".
 * `theme.fg` is applied by the caller; this returns plain segments joined.
 */
function formatUsageSegments(stats: SessionStats): string[] {
  const segs: string[] = [];
  if (stats.inputTokens) segs.push(`↑${formatTokens(stats.inputTokens)}`);
  if (stats.outputTokens) segs.push(`↓${formatTokens(stats.outputTokens)}`);
  if (stats.cacheReadTokens)
    segs.push(`R${formatTokens(stats.cacheReadTokens)}`);
  if (stats.cacheWriteTokens)
    segs.push(`W${formatTokens(stats.cacheWriteTokens)}`);
  if (stats.cost) segs.push(`$${stats.cost.toFixed(3)}`);
  return segs;
}

/** ANSI colors for widget status icons (raw, since the widget bypasses theme). */
const ICON_GREEN = "\x1b[38;2;126;186;103m";
const ICON_YELLOW = "\x1b[38;2;214;181;94m";
const ICON_RED = "\x1b[38;2;224;108;117m";
const ICON_DIM = "\x1b[38;2;128;128;128m";

/** Map a live status kind to a colored single-char icon for the widget. */
function widgetIcon(kind: StatusSnapshot["kind"]): string {
  switch (kind) {
    case "active":
    case "running":
      return `${ICON_YELLOW}⟳${RST}`;
    case "stalled":
      return `${ICON_RED}⟳${RST}`;
    case "waiting":
    case "starting":
    default:
      return `${ICON_DIM}○${RST}`;
  }
}

/**
 * Wait long enough for a freshly created pane to finish shell startup.
 *
 * Some environments do extra shell-init work before the prompt is ready
 * (for example direnv/devenv), so the delay is configurable for users who hit
 * dropped commands. Keep the historical default at 500ms.
 */
function getShellReadyDelayMs(): number {
  const raw = process.env.PI_SUBAGENT_SHELL_READY_DELAY_MS?.trim();
  const parsed = raw ? Number.parseInt(raw, 10) : Number.NaN;
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 500;
}

function muxUnavailableResult() {
  return {
    content: [
      {
        type: "text" as const,
        text: `Subagents require tmux. ${muxSetupHint()}`,
      },
    ],
    details: { error: "tmux not available" },
  };
}

/**
 * Build the internal artifact directory path for the current session.
 * Used by the subagents extension to stash task files, system prompts, and
 * launch scripts for sub-agents. Path convention:
 *   <sessionDir>/artifacts/<session-id>/
 */
function getArtifactDir(sessionDir: string, sessionId: string): string {
  return join(sessionDir, "artifacts", sessionId);
}

const statusConfig = loadStatusConfig();

function formatWidgetRightLabel(snapshot: StatusSnapshot): string {
  if (snapshot.kind === "starting") return " starting… ";
  if (snapshot.kind === "running") return ` running ${snapshot.elapsedText} `;
  if (snapshot.kind === "active") {
    const label = snapshot.activityLabel ?? snapshot.activeScope;
    const duration = snapshot.activeDurationText
      ? ` ${snapshot.activeDurationText}`
      : "";
    return label ? ` active · ${label}${duration} ` : " active ";
  }
  if (snapshot.kind === "waiting") {
    const duration = snapshot.waitingDurationText
      ? ` ${snapshot.waitingDurationText}`
      : "";
    const detail = snapshot.statusLabel ? ` · ${snapshot.statusLabel}` : "";
    return ` waiting${duration}${detail} `;
  }

  const detail = snapshot.statusLabel ? ` · ${snapshot.statusLabel}` : "";
  const duration = snapshot.snapshotProblemText
    ? ` ${snapshot.snapshotProblemText}`
    : "";
  return ` stalled${detail}${duration} `;
}

function resolveResultPresentation(
  result: Pick<
    SubagentResult,
    | "exitCode"
    | "elapsed"
    | "summary"
    | "sessionFile"
    | "sessionId"
    | "errorMessage"
    | "crashed"
  >,
  name: string,
): string {
  // Name is the persistent handle: the same name steers a running subagent or
  // resumes a finished one, so follow-ups always reference it.
  const sessionRef = `\n\nFollow up with subagent_message({ name: "${name}", message: "…" })`;

  if (result.crashed) {
    // The process died mid-run. Its last assistant message is context, not a
    // result: the work may be half done.
    return (
      `Sub-agent "${name}" crashed after ${formatElapsed(result.elapsed)} ` +
      `(exit code ${result.exitCode}).\n\n` +
      `Error: ${result.errorMessage ?? "unknown"}\n\n` +
      `Its work may be incomplete. Resuming it with subagent_message restarts ` +
      `the same session; ask it to re-check its changes (e.g. git status) ` +
      `before continuing.\n\nLast message before the crash:\n${result.summary}${sessionRef}`
    );
  }

  if (result.errorMessage) {
    // Auto-retry exhausted or other agent-loop error. The subagent did not
    // produce a usable result — surface the underlying provider/network
    // failure so the orchestrator can decide whether to retry, resume, or
    // change approach instead of silently treating the run as completed.
    return (
      `Sub-agent "${name}" failed after ${formatElapsed(result.elapsed)} ` +
      `(provider/agent error — auto-retry exhausted).\n\n` +
      `Error: ${result.errorMessage}\n\n` +
      `The subagent did not produce a result. You can retry by spawning a new ` +
      `subagent or resume the session with subagent_message.${sessionRef}`
    );
  }

  return result.exitCode !== 0
    ? `Sub-agent "${name}" failed (exit code ${result.exitCode}).\n\n${result.summary}${sessionRef}`
    : `Sub-agent "${name}" completed (${formatElapsed(result.elapsed)}).\n\n${result.summary}${sessionRef}`;
}

/**
 * Result from running a single subagent.
 */
interface SubagentResult {
  name: string;
  task: string;
  summary: string;
  sessionFile?: string;
  /** Canonical session header id, used for follow-ups via subagent_message. */
  sessionId?: string;
  claudeSessionId?: string;
  exitCode: number;
  elapsed: number;
  error?: string;
  /** Provider/agent error message when auto-retry exhausted (overload, rate limit, etc.). */
  errorMessage?: string;
  /** The child process died (signal or non-zero exit) instead of finishing its turn. */
  crashed?: boolean;
  /** Aggregate usage/model/tool stats parsed from the completed session file. */
  stats?: SessionStats;
}

/**
 * State for a launched (but not yet completed) subagent.
 */
interface RunningSubagent {
  id: string;
  name: string;
  task: string;
  agent?: string;
  surface: string;
  startTime: number;
  sessionFile: string;
  launchScriptFile?: string;
  activityFile?: string;
  activity?: SubagentActivityState;
  activityRead?: {
    ok: boolean;
    reason?: "missing" | "invalid" | "wrong-id";
    error?: string;
  };
  abortController?: AbortController;
  cli?: string;
  sentinelFile?: string;
  statusState: SubagentStatusState;
  /**
   * When true, status transitions (stalled/recovered) do not wake the parent
   * session via a steer message. The widget still updates locally. Used for
   * long-running agents where the user drives the conversation in the
   * subagent's pane (e.g. planner).
   */
  interactive: boolean;
  /** Keep-alive: the child parks after each turn instead of exiting. */
  keepAlive?: boolean;
  /** True while a keep-alive child is parked waiting for the orchestrator. */
  parked?: boolean;
  /** Epoch ms when the child last parked (drives the idle close). */
  parkedSince?: number;
  /** Session entry count already covered by a delivered result. */
  deliveredEntryCount?: number;
  /** Number of per-turn results delivered so far. */
  turnsDelivered?: number;
  /** Set when the orchestrator or the idle timeout closed the subagent. */
  closeReason?: "orchestrator" | "idle";
  /** Worktree this subagent runs in (isolation: "worktree"). */
  worktree?: SubagentWorktree;
  /** Set once the worktree was released (removed or kept) on close. */
  worktreeRelease?: WorktreeRelease;
  /** Docker sandbox this subagent's tools run in (isolation: "container"). */
  sandbox?: Sandbox;
  /** Set once removal of the sandbox was started. */
  sandboxReleased?: boolean;
  /** Parent artifact dir; needed to resume the session after a crash. */
  artifactDir?: string;
  /** Automatic resumes already spent on crashes (see MAX_CRASH_RESUMES). */
  crashResumes?: number;
}

/** How many times a crashed subagent is resumed automatically in a row. */
const MAX_CRASH_RESUMES = 2;

/**
 * Whether a crashed subagent should be resumed automatically: only pi
 * children that died mid-turn, were not closed or interrupted on purpose,
 * are not driven by the user, and have retries left.
 */
function shouldAutoResume(
  running: Pick<
    RunningSubagent,
    "closeReason" | "cli" | "interactive" | "artifactDir" | "crashResumes"
  >,
  result: Pick<SubagentResult, "crashed" | "exitCode">,
): boolean {
  return (
    result.crashed === true &&
    result.exitCode !== 130 && // SIGINT: someone pressed Ctrl+C in the pane
    !running.closeReason &&
    running.cli !== "claude" &&
    !running.interactive &&
    running.artifactDir !== undefined &&
    (running.crashResumes ?? 0) < MAX_CRASH_RESUMES
  );
}

/** The message a crashed subagent is resumed with. */
function crashResumeMessage(result: Pick<SubagentResult, "exitCode" | "errorMessage">): string {
  return (
    `Your previous run crashed (exit ${result.exitCode}): ${result.errorMessage ?? "no error captured"}. ` +
    "The harness resumed this session automatically. Your last tool call or edit may not have finished. " +
    "Re-check the state first (git status / git diff, or re-read the files you were changing), " +
    "then continue the original task from where it stopped."
  );
}

const keepAliveConfig: KeepAliveConfig = loadKeepAliveConfig([
  join(SUBAGENTS_DIR, "config.json"),
  join(SUBAGENTS_DIR, "config.json.example"),
]);

/** All currently running subagents, keyed by id. */
const runningSubagents = new Map<string, RunningSubagent>();

// When this extension is loaded inside a subagent that itself spawns children
// (e.g. a worker delegating to scout/researcher), `subagent-done.ts` runs in the
// same process and needs to know whether this session still has children in
// flight — so it can suppress auto-exit and keep the session open until they all
// report back. Expose a live count through a process-global symbol that both
// modules share. (subagent-done.ts reads it; if absent it assumes zero.)
const RUNNING_CHILDREN_COUNT_KEY = Symbol.for(
  "pi-subagents/running-children-count",
);
// Parked keep-alive children have already reported back, so they do not hold
// their parent open.
(globalThis as any)[RUNNING_CHILDREN_COUNT_KEY] = () =>
  Array.from(runningSubagents.values()).filter((r) => !r.parked).length;

// ── Widget management ──

/** Latest ExtensionContext from session_start, used for widget updates. */
let latestCtx: ExtensionContext | null = null;
/** Latest ExtensionAPI, used to deliver ask_question notifications from the watcher. */
let latestPi: ExtensionAPI | null = null;

/** Interval timer for widget re-renders. */
let widgetInterval: ReturnType<typeof setInterval> | null = null;

/** Interval timer for status transition checks. */
let statusInterval: ReturnType<typeof setInterval> | null = null;

function formatElapsedMMSS(startTime: number): string {
  const seconds = Math.floor((Date.now() - startTime) / 1000);
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

const ACCENT = "\x1b[38;2;77;163;255m";
const RST = "\x1b[0m";

/**
 * Build a bordered content line: │left          right│
 * Left content is truncated if needed, right is preserved, padded to fill width.
 */
function borderLine(left: string, right: string, width: number): string {
  if (width <= 0) return "";
  if (width === 1) return `${ACCENT}│${RST}`;

  // width = total visible chars for the whole line including │ and │
  const contentWidth = Math.max(0, width - 2); // space inside the two │ chars
  const rightVis = visibleWidth(right);

  // If the status chunk alone is too wide, prefer preserving it in compact form
  // rather than overflowing the terminal.
  if (rightVis >= contentWidth) {
    const truncRight = truncateToWidth(right, contentWidth);
    const rightPad = Math.max(0, contentWidth - visibleWidth(truncRight));
    return `${ACCENT}│${RST}${truncRight}${" ".repeat(rightPad)}${ACCENT}│${RST}`;
  }

  const maxLeft = Math.max(0, contentWidth - rightVis);
  const truncLeft = truncateToWidth(left, maxLeft);
  const leftVis = visibleWidth(truncLeft);
  const pad = Math.max(0, contentWidth - leftVis - rightVis);
  return `${ACCENT}│${RST}${truncLeft}${" ".repeat(pad)}${right}${ACCENT}│${RST}`;
}

/**
 * Build the bordered top line: ╭─ Title ──── info ─╮
 * All chars are accounted for within `width`.
 */
function borderTop(title: string, info: string, width: number): string {
  if (width <= 0) return "";
  if (width === 1) return `${ACCENT}╭${RST}`;

  // ╭─ Title ───...─── info ─╮
  // overhead: ╭─ (2) + space around title (2) + space around info (2) + ─╮ (2) = but we simplify
  const inner = Math.max(0, width - 2); // inside ╭ and ╮
  const titlePart = `─ ${title} `;
  const infoPart = ` ${info} ─`;
  const fillLen = Math.max(0, inner - titlePart.length - infoPart.length);
  const fill = "─".repeat(fillLen);
  const content = `${titlePart}${fill}${infoPart}`
    .slice(0, inner)
    .padEnd(inner, "─");
  return `${ACCENT}╭${content}╮${RST}`;
}

/**
 * Build the bordered bottom line: ╰──────────────────╯
 */
function borderBottom(width: number): string {
  if (width <= 0) return "";
  if (width === 1) return `${ACCENT}╰${RST}`;

  const inner = Math.max(0, width - 2);
  return `${ACCENT}╰${"─".repeat(inner)}╯${RST}`;
}

// ── External rows ──
//
// Other extensions (e.g. superpowers' /plan and /review) show their own child
// agents inside this widget instead of drawing a second box. Contract, shared
// through a process-global symbol so neither side imports the other:
//
//   globalThis[Symbol.for("pi-subagents/external-rows")] = {
//     sources: Map<string, () => ExternalWidgetRow[]>, // set/delete by providers
//     refresh?: () => void,                            // set by this extension
//   }
//
// Providers call refresh() after changing their rows; while any row exists
// this widget re-renders every second, so elapsed times tick.

export interface ExternalWidgetRow {
  status: "running" | "done" | "error";
  /** Start time (ms); elapsed counts from here while running. */
  startedAt: number;
  /** Frozen elapsed (ms) once not running. */
  elapsedMs?: number;
  name: string;
  /** Shown in parentheses after the name, like a subagent's profile. */
  tag?: string;
  /** Right-hand status text. */
  detail?: string;
}

interface ExternalRowsHost {
  sources: Map<string, () => ExternalWidgetRow[]>;
  refresh?: () => void;
}

const EXTERNAL_ROWS_KEY = Symbol.for("pi-subagents/external-rows");

function externalRowsHost(): ExternalRowsHost {
  const g = globalThis as Record<symbol, ExternalRowsHost | undefined>;
  g[EXTERNAL_ROWS_KEY] ??= { sources: new Map() };
  return g[EXTERNAL_ROWS_KEY];
}

function collectExternalRows(): ExternalWidgetRow[] {
  const rows: ExternalWidgetRow[] = [];
  for (const provide of externalRowsHost().sources.values()) {
    try {
      rows.push(...provide());
    } catch {
      // A broken provider must not take the widget down.
    }
  }
  return rows;
}

function formatMMSS(ms: number): string {
  const seconds = Math.max(0, Math.floor(ms / 1000));
  return `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
}

function externalRowLine(row: ExternalWidgetRow, width: number, now: number): string {
  const icon =
    row.status === "running"
      ? widgetIcon("running")
      : row.status === "done"
        ? `${ICON_GREEN}✓${RST}`
        : `${ICON_RED}✗${RST}`;
  const elapsed = formatMMSS(row.status === "running" ? now - row.startedAt : (row.elapsedMs ?? 0));
  const tag = row.tag ? ` (${row.tag})` : "";
  const right = row.detail ? ` ${row.detail} ` : " ";
  return borderLine(` ${icon} ${elapsed}  ${row.name}${tag} `, right, width);
}

function renderSubagentWidgetLines(
  agents: RunningSubagent[],
  width: number,
  external: ExternalWidgetRow[] = [],
  now: number = Date.now(),
): string[] {
  const count = agents.length + external.filter((row) => row.status === "running").length;
  const title = "Subagents";
  const info = `${count} running`;

  const lines: string[] = [borderTop(title, info, width)];

  for (const agent of agents) {
    const elapsed = formatElapsedMMSS(agent.startTime);
    const agentTag = agent.agent ? ` (${agent.agent})` : "";
    const snapshot = classifyStatus(agent.statusState, Date.now());
    const icon = widgetIcon(snapshot.kind);
    const left = ` ${icon} ${elapsed}  ${agent.name}${agentTag} `;
    const right = statusConfig.enabled
      ? formatWidgetRightLabel(snapshot)
      : agent.cli === "claude"
        ? " running… "
        : " starting… ";

    lines.push(borderLine(left, right, width));
  }

  for (const row of external) lines.push(externalRowLine(row, width, now));

  lines.push(borderBottom(width));
  return lines;
}

function updateWidget() {
  if (!latestCtx?.hasUI) return;

  if (runningSubagents.size === 0 && collectExternalRows().length === 0) {
    latestCtx.ui.setWidget("subagent-status", undefined);
    if (widgetInterval) {
      clearInterval(widgetInterval);
      widgetInterval = null;
      (globalThis as any)[WIDGET_INTERVAL_KEY] = null;
    }
    return;
  }

  latestCtx.ui.setWidget(
    "subagent-status",
    (_tui: any, _theme: any) => {
      return {
        invalidate() {},
        render(width: number) {
          return renderSubagentWidgetLines(
            Array.from(runningSubagents.values()),
            width,
            collectExternalRows(),
          );
        },
      };
    },
    { placement: "aboveEditor" },
  );
}

/**
 * Build the positional prompt args for a Pi CLI subagent launch.
 *
 * In artifact-backed launches (lineage-only, standalone), Pi's buildInitialMessage()
 * concatenates @file content with messages[0] into one initial prompt. That breaks
 * /skill: expansion because the message no longer starts with "/skill:". Only
 * messages[1..] are sent as separate follow-up prompts where /skill: is recognized.
 *
 * When there are skill prompts AND artifact-backed delivery, we prepend an empty
 * first positional message so that /skill: args land in messages[1..] and arrive
 * as standalone prompts in the child session.
 */
const SUBAGENT_CONTROL_TOOLS = ["ask_question"] as const;

/** Model used when neither the caller nor the profile picks one. */
export const DEFAULT_SUBAGENT_MODEL = "anthropic/claude-sonnet-5-5";

/**
 * Build the child --tools allowlist.
 *
 * Pi 0.70+ applies --tools to built-in, extension, and custom tools. If a
 * subagent definition restricts tools to e.g. "read,bash,write", the child
 * control tools from subagent-done.ts would otherwise be hidden, leaving a
 * manually resumed or user-touched subagent unable to call ask_question.
 */
function buildSubagentToolAllowlist(
  effectiveTools?: string,
  opts?: { grantSpawning?: boolean },
): string | null {
  const requested = (effectiveTools ?? "")
    .split(",")
    .map((tool) => tool.trim())
    .filter(Boolean);

  const grantSpawning = opts?.grantSpawning ?? false;

  // No explicit tool restriction and no spawning grant → don't pass --tools at
  // all (the child keeps its default toolset).
  if (requested.length === 0 && !grantSpawning) return null;

  const allow = new Set(requested);
  if (grantSpawning) {
    for (const tool of SPAWNING_TOOLS) allow.add(tool);
  }
  for (const tool of SUBAGENT_CONTROL_TOOLS) {
    allow.add(tool);
  }

  return [...allow].join(",");
}

/**
 * Apply a loadout snapshot's sandbox to a pi command's `parts` array: model,
 * identity (system prompt), and the default-deny tool/extension restriction
 * (`--no-extensions` + `--tools` + one `-e` per tool-backing extension).
 *
 * This is the single source of truth for reconstructing a subagent's sandbox,
 * used both by the initial `launchSubagent` and by the `subagent_message`
 * resume path so the two can never drift. Env vars (PI_SUBAGENT_AGENT /
 * PI_SUBAGENT_ALLOWED / PI_CODING_AGENT_DIR) and cwd are the caller's
 * responsibility since they differ slightly between launch and resume.
 */
/**
 * Extensions a default-deny child loads regardless of which tools it backs.
 * They carry no tool of their own (or only wrap one), so the tool → extension
 * map never pulls them in. Paths that don't exist on disk are skipped.
 */
function getChildBaseExtensionPaths(toolAllowlist: string): string[] {
  const agentDir = getAgentConfigDir();
  const npm = join(agentDir, "npm", "node_modules");
  const paths = [
    // Compaction: without it pi falls back to a model-written summary capped at
    // 0.8 x reserveTokens, which fails in a loop once thinking plus the growing
    // summary outgrow the cap.
    join(npm, "@sting8k", "pi-vcc", "index.ts"),
    // Masks stale tool results, keeping long children's context small.
    join(npm, "@tomooshi", "condensed-milk-pi", "index.ts"),
    // One image without a mimeType 400s every later request, and a resumed
    // child would stay stuck. Children read screenshots, so guard them too.
    join(agentDir, "extensions", "image-media-type-guard.ts"),
    // Implement/review children run on claude-opus-5, whose API rejects some
    // tool-schema keywords this extension strips.
    join(agentDir, "extensions", "anthropic-tool-schema-compat", "index.ts"),
  ];
  // Re-registers `bash` so `cmd &` returns instead of hanging on the pipe.
  if (toolAllowlist.split(",").includes("bash")) {
    paths.push(join(npm, "pi-bash-bg", "dist", "index.js"));
  }
  return paths;
}

function applySandboxToParts(
  parts: string[],
  loadout: SubagentLoadout,
  opts: { artifactDir: string; name: string },
): void {
  if (loadout.model) {
    const model = loadout.thinking
      ? `${loadout.model}:${loadout.thinking}`
      : loadout.model;
    parts.push("--model", shellEscape(model));
  }

  if (loadout.identity) {
    const flag =
      loadout.systemPromptMode === "replace"
        ? "--system-prompt"
        : "--append-system-prompt";
    const spTimestamp = new Date()
      .toISOString()
      .replace(/[:.]/g, "-")
      .slice(0, 19);
    const spSafeName = opts.name
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, "")
      .replace(/\s+/g, "-")
      .replace(/-+/g, "-")
      .replace(/^-|-$/g, "");
    const spPath = join(
      opts.artifactDir,
      `context/${spSafeName || "subagent"}-sysprompt-${spTimestamp}.md`,
    );
    mkdirSync(dirname(spPath), { recursive: true });
    writeFileSync(spPath, loadout.identity, "utf8");
    parts.push(flag, shellEscape(spPath));
  }

  // Default-deny: disable global extension discovery and re-enable only the
  // extensions backing the whitelisted tools. A null allowlist means the spawn
  // was intentionally unrestricted (e.g. a fork clone) and is replayed as-is.
  if (loadout.toolAllowlist) {
    parts.push("--no-extensions");
    parts.push("--tools", shellEscape(loadout.toolAllowlist));

    const extPaths = new Set<string>();
    for (const extPath of getChildBaseExtensionPaths(loadout.toolAllowlist)) {
      if (existsSync(extPath)) extPaths.add(extPath);
    }
    for (const tool of loadout.toolAllowlist.split(",")) {
      const extPath = getToolExtensionPath(tool);
      if (extPath && existsSync(extPath)) extPaths.add(extPath);
    }
    for (const extPath of extPaths) {
      parts.push("-e", shellEscape(extPath));
    }
  }

  if (loadout.isolation === "container") {
    parts.push(...CONTAINER_CHILD_FLAGS);
  }
}

function buildPiPromptArgs(params: {
  effectiveSkills?: string;
  taskDelivery: "direct" | "artifact";
  taskArg: string;
}): string[] {
  const skillPrompts = (params.effectiveSkills ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .map((skill) => `/skill:${skill}`);

  const needsSeparator =
    params.taskDelivery === "artifact" && skillPrompts.length > 0;

  return [...(needsSeparator ? [""] : []), ...skillPrompts, params.taskArg];
}

function activityLabel(activity: SubagentActivityState): string | undefined {
  if (activity.phase !== "active") return undefined;
  if (activity.activeScope === "tool") return activity.toolName ?? "tool";
  if (activity.activeScope === "provider") return "provider";
  if (activity.activeScope === "streaming") return "streaming";
  return activity.activeScope;
}

function observeRunningSubagent(
  running: RunningSubagent,
  observedAt = Date.now(),
) {
  if (running.cli === "claude") return;

  const activityFile = running.activityFile;
  const read: ActivityReadResult = activityFile
    ? readSubagentActivityFile(activityFile, running.id)
    : { ok: false, reason: "missing" };

  running.activityRead = read.ok
    ? { ok: true }
    : { ok: false, reason: read.reason, error: read.error };

  if (read.ok) {
    running.activity = read.activity;
    running.statusState = observeStatus(
      running.statusState,
      {
        snapshot: "present",
        updatedAt: read.activity.updatedAt,
        sequence: read.activity.sequence,
        phase: read.activity.phase,
        active: read.activity.phase === "active",
        activeScope: read.activity.activeScope,
        activeSince: read.activity.activeSince,
        waitingSince: read.activity.waitingSince,
        latestEvent: read.activity.latestEvent,
        activityLabel: activityLabel(read.activity),
      },
      observedAt,
    );
    return;
  }

  running.statusState = observeStatus(
    running.statusState,
    {
      snapshot: read.reason,
      snapshotError: read.error,
    },
    observedAt,
  );
}

/**
 * Names claimed by spawns that are mid-launch but not yet registered in
 * `runningSubagents`. Parallel `subagent` tool calls run their synchronous
 * prefix (name defaulting) before any of them finishes `launchSubagent` and
 * registers, so without this they'd all see an empty map and pick the same
 * name. Reserved synchronously when a default name is chosen and released once
 * the subagent registers (or its launch fails).
 */
const reservedNames = new Set<string>();

/**
 * Return `base`, or `base-2`, `base-3`, … so the result is unique within this
 * spawner session. Considers (a) currently-running subagents, (b) names
 * reserved by parallel in-flight spawns, and (c) every name already recorded in
 * the spawner's persistent registry — so a defaulted name never collides with a
 * finished subagent either. This lets `subagent_message({ name })` address any
 * subagent of this session unambiguously, running or finished.
 *
 * `registryNames` is the set of names already taken in the registry (empty when
 * there is no session file / artifact dir yet).
 */
function currentSubagentDepth(): number {
  const parsed = Number.parseInt(process.env.PI_SUBAGENT_DEPTH ?? "0", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}

function taskName(task: string): string {
  const slug = task
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .split(/\s+/)
    .slice(0, 5)
    .join("-")
    .replace(/-+/g, "-");
  return slug || "subagent";
}

function uniqueRunningName(base: string, registryNames?: Set<string>): string {
  const taken = new Set(
    Array.from(runningSubagents.values()).map((r) => r.name),
  );
  for (const reserved of reservedNames) taken.add(reserved);
  if (registryNames) for (const n of registryNames) taken.add(n);
  if (!taken.has(base)) return base;
  let n = 2;
  while (taken.has(`${base}-${n}`)) n++;
  return `${base}-${n}`;
}

function resolveRunningByName(
  name: string,
): { running: RunningSubagent } | { error: string } {
  const requestedName = name.trim();
  if (!requestedName) {
    return { error: "Provide the exact display name of a running subagent." };
  }

  const matches = Array.from(runningSubagents.values()).filter(
    (running) => running.name === requestedName,
  );
  if (matches.length === 1) return { running: matches[0] };
  if (matches.length === 0) {
    const names = Array.from(runningSubagents.values()).map((r) => r.name);
    const hint = names.length
      ? ` Currently running: ${[...new Set(names)].join(", ")}.`
      : " No subagents are currently running.";
    return { error: `No running subagent named "${requestedName}".${hint}` };
  }

  const candidates = matches
    .map((running) => `${running.name} [${running.id}]`)
    .join(", ");
  return {
    error: `Ambiguous subagent name "${requestedName}". Matches: ${candidates}`,
  };
}

/**
 * Type a follow-up message into a running subagent's live pane. Newlines are
 * collapsed to spaces because each newline submits a turn in the child's TUI
 * editor; a multi-line message would otherwise fire as several partial turns.
 */
function steerSubagent(
  running: RunningSubagent,
  message: string,
  send: (surface: string, command: string) => void = sendCommand,
): { ok: true } | { error: string } {
  const flattened = message.replace(/\s*\n\s*/g, " ").trim();
  try {
    send(running.surface, flattened);
    return { ok: true };
  } catch (error: any) {
    return {
      error:
        `Failed to deliver message to subagent "${running.name}" via tmux: ` +
        `${error?.message ?? String(error)}`,
    };
  }
}

function handleSubagentSteer(
  params: { name?: string; message?: string },
  send: (surface: string, command: string) => void = sendCommand,
) {
  const message = params.message?.trim();
  if (!message) {
    const err = "`message` is required to steer a running subagent.";
    return {
      content: [{ type: "text" as const, text: err }],
      details: { error: err },
    };
  }

  const resolved = resolveRunningByName(params.name ?? "");
  if ("error" in resolved) {
    return {
      content: [{ type: "text" as const, text: resolved.error }],
      details: { error: resolved.error },
    };
  }

  const running = resolved.running;
  const now = Date.now();
  observeRunningSubagent(running, now);

  const steer = steerSubagent(running, message, send);
  if ("error" in steer) {
    return {
      content: [{ type: "text" as const, text: steer.error }],
      details: { error: steer.error, id: running.id, name: running.name },
    };
  }

  running.statusState = forceStatusAfterInterrupt(running.statusState, now);
  // A parked keep-alive child starts a new turn from this message.
  const wasParked = running.parked === true;
  running.parked = false;
  running.parkedSince = undefined;
  updateWidget();

  return {
    content: [
      {
        type: "text" as const,
        text: wasParked
          ? `Message delivered to subagent "${running.name}", which starts a new turn now. ` +
            `Its result arrives as a steer message when that turn ends.`
          : `Message delivered to running subagent "${running.name}". It picks this up at its next ` +
            `turn boundary. Its result arrives as a steer message when it finishes.`,
      },
    ],
    details: { id: running.id, name: running.name, status: "steered" },
  };
}

/** Implementation of the subagent_close tool, separated for tests. */
function closeSubagentByName(params: { name?: string; force?: boolean }) {
  const name = params.name?.trim() ?? "";
  const resolved = resolveRunningByName(name);
  if ("error" in resolved) {
    // A parent restart loses the in-memory map, but the hidden window may live on.
    if (name && surfaceAlive(name)) {
      closeSurface(name);
      const text = `Closed subagent window "${name}", left over from an earlier session.`;
      return {
        content: [{ type: "text" as const, text }],
        details: { name, status: "closed" },
      };
    }
    const text = `${resolved.error} It may have closed already; there is nothing to clean up.`;
    return {
      content: [{ type: "text" as const, text }],
      details: { error: text },
    };
  }

  const running = resolved.running;
  observeRunningSubagent(running);
  unparkIfActive(running);
  const busy = !running.parked;
  if (busy && !params.force) {
    const text =
      `Subagent "${running.name}" is still working on a turn. Wait for its result, ` +
      `or call subagent_close with force: true to stop it now.`;
    return {
      content: [{ type: "text" as const, text }],
      details: { error: "busy", name: running.name },
    };
  }

  const worktreeNote = closeSubagent(running, "orchestrator");
  const text =
    `Closed subagent "${running.name}"${busy ? " mid-turn" : ""}. Its session is saved; ` +
    `subagent_message({ name: "${running.name}", message: "…" }) resumes it.` +
    (worktreeNote ? `\n\n${worktreeNote}` : "");
  return {
    content: [{ type: "text" as const, text }],
    details: {
      name: running.name,
      status: "closed",
      forced: busy,
      ...(running.worktreeRelease
        ? { worktree: running.worktreeRelease }
        : {}),
    },
  };
}

function startStatusRefresh(pi: ExtensionAPI) {
  if (!statusConfig.enabled || statusInterval) return;

  statusInterval = setInterval(() => {
    if (runningSubagents.size === 0) {
      if (statusInterval) {
        clearInterval(statusInterval);
        statusInterval = null;
        (globalThis as any)[STATUS_INTERVAL_KEY] = null;
      }
      return;
    }

    const transitionLines: string[] = [];
    const now = Date.now();
    let shouldRefreshWidget = false;

    for (const running of runningSubagents.values()) {
      observeRunningSubagent(running, now);
      const { nextState, snapshot, transition } = advanceStatusState(
        running.statusState,
        now,
      );
      if (nextState.currentKind !== running.statusState.currentKind) {
        shouldRefreshWidget = true;
      }
      running.statusState = nextState;

      // Interactive subagents (long-running, user-driven) intentionally don't
      // wake the parent session on stalled/recovered transitions — the user is
      // working in the subagent's pane, and a steer message here would burn an
      // orchestrator turn on a no-op "still waiting" ping. Widget still updates.
      if (transition && !running.interactive) {
        transitionLines.push(
          formatTransitionLine(running.name, snapshot, transition),
        );
      }
    }

    if (shouldRefreshWidget) updateWidget();

    if (transitionLines.length > 0) {
      const capped = capStatusLines(transitionLines, statusConfig.lineLimit);
      pi.sendMessage(
        {
          customType: "subagent_status",
          content: formatStatusAggregate(
            transitionLines,
            statusConfig.lineLimit,
          ),
          display: true,
          details: { lines: capped.visibleLines, overflow: capped.overflow },
        },
        { triggerTurn: true, deliverAs: "steer" },
      );
    }
  }, 1000);

  (globalThis as any)[STATUS_INTERVAL_KEY] = statusInterval;
}

// Resuming a finished session is always autonomous: the relaunched agent runs
// its follow-up task to completion and the harness delivers the result as a
// steer message (fire-and-forget). An interactive resume would park the pane
// waiting for the user, contradicting that result-delivery model.
function resolveResumeLaunchBehavior(): {
  autoExit: boolean;
  interactive: boolean;
} {
  return { autoExit: true, interactive: false };
}

export const __test__ = {
  runningSubagents,
  keepAliveConfig,
  deliverTurnResult,
  resolveFinalDelivery,
  closeSubagentByName,
  closeSubagent,
  releaseRunningResources,
  withReleaseNote,
  watchSubagent,
  borderLine,
  getShellReadyDelayMs,
  renderSubagentWidgetLines,
  externalRowsHost,
  collectExternalRows,
  loadAgentDefaults,
  discoverAgentDefinitions,
  resolveEffectiveSessionMode,
  resolveLaunchBehavior,
  resolveEffectiveInteractive,
  buildSubagentToolAllowlist,
  applySandboxToParts,
  buildPiPromptArgs,
  formatWidgetRightLabel,
  observeRunningSubagent,
  getToolExtensionPath,
  getChildBaseExtensionPaths,
  resolveRunningByName,
  uniqueRunningName,
  taskName,
  reservedNames,
  steerSubagent,
  handleSubagentSteer,
  resolveResultPresentation,
  resolveResumeLaunchBehavior,
  shouldAutoResume,
  crashResumeMessage,
  MAX_CRASH_RESUMES,
  runningSubagents,
  formatElapsed,
  formatTokens,
  formatContextUsage,
  contextWindowFor,
  formatUsageSegments,
  widgetIcon,
};

function startWidgetRefresh() {
  if (widgetInterval) return;
  updateWidget(); // immediate first render
  widgetInterval = setInterval(() => {
    updateWidget();
  }, 1000);
  (globalThis as any)[WIDGET_INTERVAL_KEY] = widgetInterval;
}

/**
 * Launch a subagent: creates the multiplexer pane, builds the command, and
 * sends it. Returns a RunningSubagent — does NOT poll.
 *
 * Call watchSubagent() on the returned object to observe completion.
 */
async function launchSubagent(
  params: typeof SubagentParams.static,
  ctx: {
    sessionManager: {
      getSessionFile(): string | null;
      getSessionId(): string;
      getSessionDir(): string;
    };
    cwd: string;
  },
  options?: {
    surface?: string;
    skillBlock?: string;
    selectedSkills?: readonly SkillCandidate[];
    /** Sandbox created by the caller for isolation: "container". */
    sandbox?: Sandbox;
  },
): Promise<RunningSubagent> {
  const startTime = Date.now();
  const id = Math.random().toString(16).slice(2, 10);

  const agentDefs = params.agent ? loadAgentDefaults(params.agent) : null;
  // Subagents run on Claude unless the caller or the profile says otherwise.
  // Without this they would silently inherit the session default from
  // settings.json (currently openai-codex/gpt-5.6-sol). The Claude Code CLI
  // branch is excluded because `claude --model` wants its own naming
  // ("sonnet", "opus"), not a pi "provider/id" pair.
  const modelFallback =
    agentDefs?.cli === "claude" ? undefined : DEFAULT_SUBAGENT_MODEL;
  const effectiveModel = params.model ?? agentDefs?.model ?? modelFallback;
  const effectiveTools = agentDefs?.tools;
  const effectiveSkills = agentDefs?.skills;
  const effectiveThinking = agentDefs?.thinking;
  const effectiveInteractive = resolveEffectiveInteractive(params, agentDefs);
  const keepAlive = resolveKeepAlive({
    requested: params.keepAlive,
    autoExit: agentDefs?.autoExit ?? false,
    cli: agentDefs?.cli,
    config: keepAliveConfig,
  });

  const sessionFile = ctx.sessionManager.getSessionFile();
  if (!sessionFile) throw new Error("No session file");
  const sessionId = ctx.sessionManager.getSessionId();
  const artifactDir = getArtifactDir(
    ctx.sessionManager.getSessionDir(),
    sessionId,
  );

  const resolvedPaths = resolveSubagentPaths(params, agentDefs);
  let effectiveCwd = resolvedPaths.effectiveCwd;
  let localAgentDir = resolvedPaths.localAgentDir;
  let effectiveAgentDir = resolvedPaths.effectiveAgentDir;
  let worktree: SubagentWorktree | null = null;

  if (params.isolation === "worktree") {
    worktree = allocateSubagentWorktree({
      cwd: effectiveCwd ?? ctx.cwd,
      name: params.name,
      branch: params.branch,
    });
    effectiveCwd = worktree.path;
    localAgentDir = join(effectiveCwd, ".pi", "agent");
    effectiveAgentDir = existsSync(localAgentDir)
      ? localAgentDir
      : getAgentConfigDir();
  }

  // Container isolation: the child pi process runs on the host only to talk to
  // the model; its tools exec into the sandbox. Give it an empty cwd so no
  // host-side extension finds project files or a project .pi/agent there.
  const sandbox = params.isolation === "container" ? options?.sandbox : undefined;
  if (params.isolation === "container") {
    if (!sandbox) throw new Error('isolation: "container" needs a sandbox');
    effectiveCwd = join(
      getArtifactDir(ctx.sessionManager.getSessionDir(), ctx.sessionManager.getSessionId()),
      "sandbox-cwd",
      id,
    );
    mkdirSync(effectiveCwd, { recursive: true });
    localAgentDir = undefined;
    effectiveAgentDir = getAgentConfigDir();
  }

  const targetCwdForSession = effectiveCwd ?? ctx.cwd;
  const sessionDir = getDefaultSessionDirFor(
    targetCwdForSession,
    effectiveAgentDir,
  );

  // Generate a deterministic session file path for this subagent.
  // This eliminates race conditions when multiple agents launch simultaneously —
  // each agent knows exactly which file is theirs.
  const timestamp =
    new Date().toISOString().replace(/[:.]/g, "-").slice(0, 23) + "Z";
  const uuid = [
    id,
    Math.random().toString(16).slice(2, 10),
    Math.random().toString(16).slice(2, 10),
    Math.random().toString(16).slice(2, 6),
  ].join("-");
  const subagentSessionFile = join(sessionDir, `${timestamp}_${uuid}.jsonl`);

  // Use pre-created surface (parallel mode) or create a new one.
  // For new surfaces, pause briefly so the shell is ready before sending the command.
  const surfacePreCreated = !!options?.surface;
  const surface = options?.surface ?? createSurface(params.name);
  if (!surfacePreCreated) {
    await new Promise<void>((resolve) =>
      setTimeout(resolve, getShellReadyDelayMs()),
    );
  }

  const launchBehavior = resolveLaunchBehavior(params, agentDefs);

  if (launchBehavior.seededSessionMode) {
    seedSubagentSessionFile({
      mode: launchBehavior.seededSessionMode,
      parentSessionFile: sessionFile,
      childSessionFile: subagentSessionFile,
      childCwd: targetCwdForSession,
    });
  }

  const activityFile = getSubagentActivityFile(artifactDir, id);
  mkdirSync(dirname(activityFile), { recursive: true });
  const { inheritsConversationContext } = launchBehavior;

  // Build the task message
  // Only full-context fork mode inherits prior conversation state.
  // Blank-session modes need the wrapper instructions and artifact-backed handoff.
  const modeHint = keepAlive
    ? "Complete your task autonomously. When you are finished, stop. Your final message is sent to the orchestrator, which may send follow-up instructions into this same session or close it."
    : agentDefs?.autoExit
      ? "Complete your task autonomously. When you are finished, simply stop — your session ends automatically."
      : "Complete your task. The user can interact with you at any time, and the session ends when the user exits the pane.";
  const summaryInstruction = keepAlive
    ? "Your FINAL assistant message of each turn should summarize what you accomplished in that turn."
    : agentDefs?.autoExit
      ? "Your FINAL assistant message should summarize what you accomplished."
      : "Your FINAL assistant message (before the user exits) should summarize what you accomplished.";
  // An agent with a non-empty subagent_agents list is granted the spawning
  // toolset and may only spawn the listed agents (enforced via PI_SUBAGENT_ALLOWED).
  const grantSpawning = !!(
    agentDefs?.subagentAgents && agentDefs.subagentAgents.length > 0
  );
  const identity = agentDefs?.body ?? null;
  const systemPromptMode = agentDefs?.systemPromptMode;
  const identityInSystemPrompt = systemPromptMode && identity;
  const fullTask = buildSubagentTaskMessage({
    task: params.task,
    role: identity && !identityInSystemPrompt ? identity : null,
    modeHint,
    skillBlock: options?.skillBlock,
    context: sandbox
      ? [sandboxBriefing(sandbox), params.context ?? ""].filter(Boolean).join("\n\n")
      : params.context,
    summaryInstruction,
    inheritsConversationContext,
  });
  // ── Claude Code CLI path ──
  if (agentDefs?.cli === "claude") {
    const sentinelFile = `/tmp/pi-claude-${id}-done`;
    const pluginDir = join(SUBAGENTS_DIR, "plugin");

    const cmdParts: string[] = [];
    cmdParts.push(`PI_CLAUDE_SENTINEL=${shellEscape(sentinelFile)}`);
    cmdParts.push("claude");
    cmdParts.push("--dangerously-skip-permissions");

    if (existsSync(pluginDir)) {
      cmdParts.push("--plugin-dir", shellEscape(pluginDir));
    }

    if (effectiveModel) {
      cmdParts.push("--model", shellEscape(effectiveModel));
    }

    const sp = agentDefs.body;
    if (sp) {
      cmdParts.push("--append-system-prompt", shellEscape(sp));
    }

    // Always pass the task as the prompt — even for resumed sessions,
    // the caller's task is the follow-up instruction.
    cmdParts.push(
      shellEscape(
        buildSubagentTaskMessage({
          task: params.task,
          skillBlock: options?.skillBlock,
          context: params.context,
          inheritsConversationContext: true,
        }),
      ),
    );

    const cdPrefix = effectiveCwd ? `cd ${shellEscape(effectiveCwd)} && ` : "";
    const command = wrapSubagentCommand(
      `${cdPrefix}${cmdParts.join(" ")}`,
      exitStatusFile(subagentSessionFile),
    );

    const launchScriptName = `${
      (params.name || "subagent")
        .toLowerCase()
        .replace(/[^a-z0-9\s-]/g, "")
        .replace(/\s+/g, "-")
        .replace(/-+/g, "-")
        .replace(/^-|-$/g, "") || "subagent"
    }-${id}.sh`;
    const launchScriptFile = join(
      artifactDir,
      "subagent-scripts",
      launchScriptName,
    );

    sendLongCommand(surface, command, {
      scriptPath: launchScriptFile,
      scriptPreamble: [
        `# Claude Code subagent launch script for ${params.name}`,
        `# Generated: ${new Date().toISOString()}`,
        `# Surface: ${surface}`,
      ].join("\n"),
    });

    const running: RunningSubagent = {
      id,
      name: params.name,
      task: params.task,
      agent: params.agent,
      surface,
      startTime,
      sessionFile: subagentSessionFile,
      launchScriptFile,
      cli: "claude",
      sentinelFile,
      interactive: effectiveInteractive,
      ...(worktree ? { worktree } : {}),
      statusState: createStatusState({
        source: "claude",
        startTimeMs: startTime,
      }),
    };

    runningSubagents.set(id, running);
    return running;
  }

  // ── Pi CLI path ──

  // Build pi command
  const parts: string[] = ["pi"];
  parts.push("--session", shellEscape(subagentSessionFile));

  const subagentDonePath = join(SUBAGENTS_DIR, "subagent-done.ts");
  parts.push("-e", shellEscape(subagentDonePath));

  // Resolve the config dir the child sees: a target-local .pi/agent/ wins,
  // else the propagated global dir. Captured once so the launch env and the
  // resume snapshot agree.
  const resolvedAgentDir =
    localAgentDir && existsSync(localAgentDir)
      ? localAgentDir
      : (process.env.PI_CODING_AGENT_DIR ?? null);

  // Default-deny model: when an agent restricts its tools (or is granted the
  // spawning toolset), we disable global extension discovery and re-enable only
  // the extensions backing the whitelisted tools. Bare/fork spawns with no tool
  // restriction keep their full default toolset and all global extensions.
  // A container child gets the sandbox tools and nothing else, whatever its
  // profile lists.
  const toolAllowlist = sandbox
    ? containerToolAllowlist()
    : buildSubagentToolAllowlist(effectiveTools, { grantSpawning });

  // Snapshot the fully-resolved sandbox beside the session file so a later
  // `subagent_message({ name })` resume can replay the exact same
  // restriction instead of relaunching pi with all global extensions + tools.
  const loadout: SubagentLoadout = {
    agent: params.agent ?? null,
    toolAllowlist,
    model: effectiveModel ?? null,
    thinking: effectiveThinking ?? null,
    systemPromptMode: systemPromptMode ?? null,
    identity: identityInSystemPrompt ? identity : null,
    spawnable: agentDefs?.subagentAgents ?? null,
    autoExit: agentDefs?.autoExit ?? false,
    keepAlive,
    cwd: effectiveCwd ?? null,
    agentDir: resolvedAgentDir,
    isolation: params.isolation ?? "shared",
    worktree,
    container: sandbox
      ? { network: sandbox.network, source: sandbox.source }
      : null,
    context: params.context ?? "",
    profile: params.agent ?? "general",
    skills: (options?.selectedSkills ?? []).map((skill) => ({
      name: skill.name,
      scope: skill.scope,
      filePath: skill.filePath,
    })),
  };
  writeSubagentLoadout(subagentSessionFile, loadout);

  // Apply model, identity, and the default-deny tool/extension restriction via
  // the shared helper (same code path resume uses — they can't drift).
  applySandboxToParts(parts, loadout, { artifactDir, name: params.name });

  // Build env prefix: subagent identity + config dir propagation + spawn allowlist
  const envParts: string[] = [];
  if (sandbox) {
    for (const [key, value] of Object.entries(containerChildEnv(sandbox))) {
      envParts.push(`${key}=${shellEscape(value)}`);
    }
  }

  if (resolvedAgentDir) {
    envParts.push(`PI_CODING_AGENT_DIR=${shellEscape(resolvedAgentDir)}`);
  }

  if (grantSpawning && agentDefs?.subagentAgents) {
    envParts.push(
      `PI_SUBAGENT_ALLOWED=${shellEscape(agentDefs.subagentAgents.join(","))}`,
    );
  }
  // Depth lets nested children (and guards like bash-guard) tell a headless
  // subagent apart from the interactive parent session.
  envParts.push(`PI_SUBAGENT_DEPTH=${currentSubagentDepth() + 1}`);
  envParts.push(
    `PI_SUBAGENT_ISOLATION=${shellEscape(params.isolation ?? "shared")}`,
  );
  envParts.push(`PI_SUBAGENT_NAME=${shellEscape(params.name)}`);
  if (params.agent) {
    envParts.push(`PI_SUBAGENT_AGENT=${shellEscape(params.agent)}`);
  }
  if (agentDefs?.autoExit) {
    envParts.push(`PI_SUBAGENT_AUTO_EXIT=1`);
  }
  if (keepAlive) {
    envParts.push(`PI_SUBAGENT_KEEP_ALIVE=1`);
  }
  envParts.push(`PI_SUBAGENT_SESSION=${shellEscape(subagentSessionFile)}`);
  envParts.push(`PI_SUBAGENT_ID=${shellEscape(id)}`);
  envParts.push(`PI_SUBAGENT_ACTIVITY_FILE=${shellEscape(activityFile)}`);
  envParts.push(`PI_SUBAGENT_SURFACE=${shellEscape(surface)}`);
  const envPrefix = envParts.join(" ") + " ";

  // Pass task and skill prompts to the sub-agent.
  // Only full-context fork mode gets a direct task argument because it already
  // inherits the parent conversation. Blank-session modes use artifact-backed
  // handoff so the wrapper instructions arrive as the initial user message.
  let taskArg: string;
  if (launchBehavior.taskDelivery === "direct") {
    taskArg = fullTask;
  } else {
    const timestamp = new Date()
      .toISOString()
      .replace(/[:.]/g, "-")
      .slice(0, 19);
    const safeName = params.name
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, "") // strip everything except alphanumeric, spaces, hyphens
      .replace(/\s+/g, "-") // spaces to hyphens
      .replace(/-+/g, "-") // collapse multiple hyphens
      .replace(/^-|-$/g, ""); // trim leading/trailing hyphens
    const artifactName = `context/${safeName || "subagent"}-${timestamp}.md`;
    const artifactPath = join(artifactDir, artifactName);
    mkdirSync(dirname(artifactPath), { recursive: true });
    writeFileSync(artifactPath, fullTask, "utf8");
    taskArg = `@${artifactPath}`;
  }

  for (const promptArg of buildPiPromptArgs({
    // Container children run with --no-skills; skills would load host files.
    effectiveSkills: sandbox ? undefined : effectiveSkills,
    taskDelivery: launchBehavior.taskDelivery,
    taskArg,
  })) {
    parts.push(shellEscape(promptArg));
  }

  // Resolve cwd — param overrides agent default, supports absolute and relative paths.
  // This was already computed above so session placement, PI_CODING_AGENT_DIR, and cd agree.
  const cdPrefix = effectiveCwd ? `cd ${shellEscape(effectiveCwd)} && ` : "";

  const piCommand = cdPrefix + envPrefix + parts.join(" ");
  const command = wrapSubagentCommand(
    piCommand,
    exitStatusFile(subagentSessionFile),
  );
  const launchScriptName = `${
    (params.name || "subagent")
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, "")
      .replace(/\s+/g, "-")
      .replace(/-+/g, "-")
      .replace(/^-|-$/g, "") || "subagent"
  }-${id}.sh`;
  const launchScriptFile = join(
    artifactDir,
    "subagent-scripts",
    launchScriptName,
  );
  sendLongCommand(surface, command, {
    scriptPath: launchScriptFile,
    scriptPreamble: [
      `# Subagent launch script for ${params.name}`,
      `# Generated: ${new Date().toISOString()}`,
      `# Session: ${subagentSessionFile}`,
      `# Surface: ${surface}`,
    ].join("\n"),
  });

  const running: RunningSubagent = {
    id,
    name: params.name,
    task: params.task,
    agent: params.agent,
    surface,
    startTime,
    sessionFile: subagentSessionFile,
    launchScriptFile,
    activityFile,
    interactive: effectiveInteractive,
    keepAlive,
    deliveredEntryCount: 0,
    turnsDelivered: 0,
    artifactDir,
    ...(worktree ? { worktree } : {}),
    ...(sandbox ? { sandbox } : {}),
    statusState: createStatusState({
      source: "pi",
      startTimeMs: startTime,
    }),
  };

  runningSubagents.set(id, running);
  return running;
}

/**
 * Watch a launched subagent until it exits. Polls for completion, extracts
 * the summary from the session file, cleans up the surface,
 * and removes the entry from runningSubagents.
 */
const CLAUDE_SESSIONS_DIR = join(
  process.env.HOME ?? "/tmp",
  ".pi",
  "agent",
  "sessions",
  "claude-code",
);

function copyClaudeSession(sentinelFile: string): string | null {
  try {
    const transcriptFile = sentinelFile + ".transcript";
    if (!existsSync(transcriptFile)) return null;
    const transcriptPath = readFileSync(transcriptFile, "utf-8").trim();
    if (!transcriptPath || !existsSync(transcriptPath)) return null;
    mkdirSync(CLAUDE_SESSIONS_DIR, { recursive: true });
    const filename =
      transcriptPath.split("/").pop() ?? `claude-${Date.now()}.jsonl`;
    const dest = join(CLAUDE_SESSIONS_DIR, filename);
    copyFileSync(transcriptPath, dest);
    return filename;
  } catch {
    return null;
  }
}

/**
 * Detect an `ask_question` signal from a still-running subagent and notify the
 * orchestrator without ending the subagent. Each subagent has its own
 * `${sessionFile}.ask` file and its own watcher, so parallel questions from
 * multiple subagents are delivered independently. The file is deleted after
 * delivery so it fires once per question (a subagent may ask again later).
 */
function deliverPendingQuestion(running: RunningSubagent): void {
  const askFile = `${running.sessionFile}.ask`;
  let payload: any = null;
  try {
    if (!existsSync(askFile)) return;
    payload = JSON.parse(readFileSync(askFile, "utf-8"));
  } catch {
    // Malformed/partway-written file — drop it and move on.
  }
  try {
    unlinkSync(askFile);
  } catch {}
  if (!payload?.question) return;

  const name = running.name; // unique per session (deduped at spawn) — targets the reply
  const sessionId = existsSync(running.sessionFile)
    ? getSessionId(running.sessionFile)
    : null;
  const elapsed = Math.floor((Date.now() - running.startTime) / 1000);
  const replyHint = `\n\nReply with subagent_message({ name: "${name}", message: "…" }) — the same name works whether it is still running or has since exited. It stays open until you reply.`;

  latestPi?.sendMessage(
    {
      customType: "subagent_question",
      content: `Sub-agent "${name}" asks (${formatElapsed(elapsed)}):\n\n${payload.question}${replyHint}`,
      display: true,
      details: {
        name,
        agent: running.agent,
        question: payload.question,
        ...(sessionId ? { sessionId } : {}),
      },
    },
    { triggerTurn: true, deliverAs: "steer" },
  );
}

/** Footer appended to keep-alive results: the subagent is open and the orchestrator decides what happens next. */
function keepAliveFooter(name: string): string {
  const idle =
    keepAliveConfig.idleCloseMinutes > 0
      ? ` If left idle it closes itself after ${keepAliveConfig.idleCloseMinutes} minutes.`
      : "";
  return (
    `\n\n"${name}" is still open and idle. Send more work with subagent_message, ` +
    `or close it with subagent_close({ name: "${name}" }) once you have accepted the result.${idle}`
  );
}

/**
 * Keep-alive: deliver the result of a turn that just ended while the child
 * stays open. Driven by the `${sessionFile}.turn` sidecar the child writes.
 */
function deliverTurnResult(running: RunningSubagent): void {
  if (!running.keepAlive || running.closeReason) return;
  const signal = consumeTurnSignal(running.sessionFile);
  if (!signal) return;

  const fromEntry = running.deliveredEntryCount ?? 0;
  let summary: string | null = null;
  let entryCount = fromEntry;
  const hasSession = existsSync(running.sessionFile);
  if (hasSession) {
    const entries = getNewEntries(running.sessionFile, fromEntry);
    entryCount = fromEntry + entries.length;
    summary = findLastAssistantMessage(entries);
  }
  running.deliveredEntryCount = entryCount;
  running.turnsDelivered = (running.turnsDelivered ?? 0) + 1;
  running.parked = true;
  running.parkedSince = signal.at;

  const errorMessage =
    signal.type === "error"
      ? signal.errorMessage || "Subagent turn ended with an agent error."
      : undefined;
  const elapsed = Math.floor((Date.now() - running.startTime) / 1000);
  const sessionId = hasSession ? getSessionId(running.sessionFile) : null;
  const stats = hasSession ? summarizeSessionStats(running.sessionFile) : null;
  const exitCode = errorMessage ? 1 : 0;
  const presentation =
    resolveResultPresentation(
      {
        exitCode,
        elapsed,
        summary:
          summary ??
          (errorMessage
            ? `Subagent error: ${errorMessage}`
            : "Sub-agent ended its turn without a final message."),
        sessionFile: running.sessionFile,
        ...(sessionId ? { sessionId } : {}),
        ...(errorMessage ? { errorMessage } : {}),
      },
      running.name,
    ) + keepAliveFooter(running.name);

  latestPi?.sendMessage(
    {
      customType: "subagent_result",
      content: presentation,
      display: true,
      details: {
        name: running.name,
        task: running.task,
        agent: running.agent,
        exitCode,
        elapsed,
        sessionFile: running.sessionFile,
        ...(sessionId ? { sessionId } : {}),
        ...(errorMessage ? { errorMessage } : {}),
        ...(stats ? { stats } : {}),
        open: true,
      },
    },
    { triggerTurn: true, deliverAs: "steer" },
  );
  updateWidget();
}

/** A parked child that shows activity newer than its turn signal has started a new turn. */
function unparkIfActive(running: RunningSubagent): void {
  if (!running.parked) return;
  const activity = running.activity;
  if (
    activity?.phase === "active" &&
    (activity.updatedAt ?? 0) > (running.parkedSince ?? 0)
  ) {
    running.parked = false;
    running.parkedSince = undefined;
  }
}

/**
 * End a subagent: kill its tmux window (which ends the pi process) and stop
 * watching it. The session file is already flushed entry by entry, so it
 * stays resumable by name. The watcher's own completion path sees
 * `closeReason` and skips the duplicate result.
 */
/**
 * Close a subagent's window and release its worktree or sandbox. Returns the
 * release report (null for shared subagents).
 */
function closeSubagent(
  running: RunningSubagent,
  reason: "orchestrator" | "idle",
): string | null {
  running.closeReason = reason;
  runningSubagents.delete(running.id);
  try {
    closeSurface(running.surface);
  } catch {
    // Already gone.
  }
  running.abortController?.abort();
  const worktreeNote = releaseRunningResources(running);
  updateWidget();
  return worktreeNote;
}

/**
 * Release what a closed subagent held. A worktree is removed when clean and
 * kept when it has uncommitted or untracked files. A Docker sandbox is always
 * removed, in a detached process so closing never waits on Docker.
 * Idempotent (every close path calls it, the watcher again after exit) and
 * never throws. Returns the report for the orchestrator, or null when the
 * subagent held nothing.
 */
function releaseRunningResources(running: RunningSubagent): string | null {
  const notes: string[] = [];
  if (running.worktree) {
    if (!running.worktreeRelease) {
      running.worktreeRelease = releaseSubagentWorktree(running.worktree);
    }
    notes.push(describeWorktreeRelease(running.worktreeRelease));
  }
  if (running.sandbox) {
    if (!running.sandboxReleased) {
      running.sandboxReleased = true;
      destroySandboxDetached(running.sandbox);
    }
    notes.push(
      `Removed sandbox ${running.sandbox.container}. A follow-up message starts a fresh sandbox with the same source.`,
    );
  }
  return notes.length > 0 ? notes.join("\n") : null;
}

/** Append the release report (if any) to a message for the orchestrator. */
function withReleaseNote(text: string, running: RunningSubagent): string {
  const note = releaseRunningResources(running);
  return note ? `${text}\n\n${note}` : text;
}

type FinalDelivery =
  | { kind: "deliver" }
  | { kind: "silent" }
  | { kind: "notice"; text: string };

/**
 * Decide how to report a subagent whose process has ended. Keep-alive agents
 * already delivered their results turn by turn, so their exit is usually not
 * news: closing by the orchestrator is silent, an idle close or a self-exit
 * with nothing new is a short notice that does not wake the orchestrator.
 */
function resolveFinalDelivery(
  running: RunningSubagent,
  currentEntryCount: number,
  crash?: Pick<SubagentResult, "crashed" | "errorMessage">,
): FinalDelivery {
  if (running.closeReason === "orchestrator") return { kind: "silent" };
  const resumeHint = `Its session is saved; subagent_message({ name: "${running.name}", message: "…" }) resumes it.`;
  if (running.closeReason === "idle") {
    return {
      kind: "notice",
      text: withReleaseNote(
        `Sub-agent "${running.name}" closed after ${keepAliveConfig.idleCloseMinutes} idle minutes. ${resumeHint}`,
        running,
      ),
    };
  }
  if (
    running.keepAlive &&
    (running.turnsDelivered ?? 0) > 0 &&
    currentEntryCount <= (running.deliveredEntryCount ?? 0)
  ) {
    return {
      kind: "notice",
      text: withReleaseNote(
        crash?.crashed
          ? `Sub-agent "${running.name}" crashed while idle, after delivering its last result (${crash.errorMessage ?? "no error captured"}). ${resumeHint}`
          : `Sub-agent "${running.name}" exited after delivering its last result. ${resumeHint}`,
        running,
      ),
    };
  }
  return { kind: "deliver" };
}

/**
 * Apply resolveFinalDelivery. Returns true when the caller should go on to
 * deliver the full result as usual.
 */
function handleFinalDelivery(
  pi: ExtensionAPI,
  running: RunningSubagent,
  result?: Pick<SubagentResult, "crashed" | "errorMessage">,
): boolean {
  const count = existsSync(running.sessionFile)
    ? countSessionEntryLines(running.sessionFile)
    : 0;
  const decision = resolveFinalDelivery(running, count, result);
  if (decision.kind === "deliver") return true;
  if (decision.kind === "notice") {
    pi.sendMessage(
      {
        customType: "subagent_status",
        content: decision.text,
        display: true,
        details: { lines: [decision.text], overflow: 0 },
      },
      { triggerTurn: false },
    );
  }
  return false;
}

async function watchSubagent(
  running: RunningSubagent,
  signal: AbortSignal,
): Promise<SubagentResult> {
  const { name, task, surface, startTime, sessionFile } = running;

  try {
    const result = await pollForExit(
      surface,
      AbortSignal.any([signal, getModuleAbortSignal()]),
      {
        interval: 1000,
        sessionFile,
        sentinelFile: running.sentinelFile,
        onTick() {
          observeRunningSubagent(running);
          unparkIfActive(running);
          deliverPendingQuestion(running);
          deliverTurnResult(running);
          if (
            running.parked &&
            shouldIdleClose(
              running.parkedSince,
              Date.now(),
              keepAliveConfig.idleCloseMinutes,
            )
          ) {
            closeSubagent(running, "idle");
          }
        },
      },
    );

    const elapsed = Math.floor((Date.now() - startTime) / 1000);

    if (running.cli === "claude") {
      // Claude Code result extraction
      let summary = "";

      if (running.sentinelFile) {
        try {
          summary = readFileSync(running.sentinelFile, "utf-8").trim();
        } catch {}
      }

      if (!summary) {
        summary = readScreen(surface, 200)
          .replace(/__SUBAGENT_DONE_\d+__/, "")
          .trimEnd();
      }

      if (!summary) {
        summary =
          result.exitCode !== 0
            ? `Claude Code exited with code ${result.exitCode}`
            : "Claude Code exited without output";
      }

      // Copy Claude session transcript
      let sessionId: string | null = null;
      if (running.sentinelFile) {
        sessionId = copyClaudeSession(running.sentinelFile);
        try {
          unlinkSync(running.sentinelFile);
        } catch {}
        try {
          unlinkSync(running.sentinelFile + ".transcript");
        } catch {}
      }

      closeSurface(surface);
      runningSubagents.delete(running.id);
      releaseRunningResources(running);

      return {
        name,
        task,
        summary,
        exitCode: result.exitCode,
        elapsed,
        ...(sessionId ? { claudeSessionId: sessionId } : {}),
      };
    }

    // Pi subagent result extraction
    let summary: string;
    if (existsSync(sessionFile)) {
      const allEntries = getNewEntries(sessionFile, 0);
      summary =
        findLastAssistantMessage(allEntries) ??
        (result.errorMessage
          ? `Subagent error: ${result.errorMessage}`
          : result.exitCode !== 0
            ? `Sub-agent exited with code ${result.exitCode}`
            : "Sub-agent exited without output");
    } else {
      summary = result.errorMessage
        ? `Subagent error: ${result.errorMessage}`
        : result.exitCode !== 0
          ? `Sub-agent exited with code ${result.exitCode}`
          : "Sub-agent exited without output";
    }

    const stats = existsSync(sessionFile)
      ? summarizeSessionStats(sessionFile)
      : null;
    const subagentSessionId = existsSync(sessionFile)
      ? getSessionId(sessionFile)
      : null;

    closeSurface(surface);
    runningSubagents.delete(running.id);
    releaseRunningResources(running);

    return {
      name,
      task,
      summary,
      sessionFile,
      ...(subagentSessionId ? { sessionId: subagentSessionId } : {}),
      exitCode: result.exitCode,
      elapsed,
      ...(result.errorMessage ? { errorMessage: result.errorMessage } : {}),
      ...(result.reason === "crashed" ? { crashed: true } : {}),
      ...(stats ? { stats } : {}),
    };
  } catch (err: any) {
    try {
      closeSurface(surface);
    } catch {}
    runningSubagents.delete(running.id);
    releaseRunningResources(running);

    if (signal.aborted) {
      return {
        name,
        task,
        summary: "Subagent cancelled.",
        exitCode: 1,
        elapsed: Math.floor((Date.now() - startTime) / 1000),
        error: "cancelled",
        sessionFile,
      };
    }
    return {
      name,
      task,
      summary: `Subagent error: ${err?.message ?? String(err)}`,
      exitCode: 1,
      elapsed: Math.floor((Date.now() - startTime) / 1000),
      error: err?.message ?? String(err),
    };
  }
}

export default function subagentsExtension(pi: ExtensionAPI) {
  latestPi = pi;
  // Host external rows (see "External rows" above). Re-render now, then keep
  // ticking while any row is visible; updateWidget stops the timer once empty.
  const refreshExternalRows = () => {
    updateWidget();
    if (collectExternalRows().length > 0) startWidgetRefresh();
  };
  externalRowsHost().refresh = refreshExternalRows;
  // Capture the UI context for widget updates
  pi.on("session_start", (_event, ctx) => {
    latestCtx = ctx;
    externalRowsHost().refresh = refreshExternalRows;
    // pi runs multiple sessions in one process. A prior session's shutdown
    // aborts the shared module poll-abort controller; install a fresh one so
    // subagents spawned in this session aren't watched against a dead signal.
    // See https://github.com/HazAT/pi-interactive-subagents/issues/5
    const prevAbort = (globalThis as any)[POLL_ABORT_KEY] as
      | AbortController
      | undefined;
    if (!prevAbort || prevAbort.signal.aborted) {
      (globalThis as any)[POLL_ABORT_KEY] = new AbortController();
    }
  });

  // Clean up on session shutdown
  pi.on("session_shutdown", (_event, _ctx) => {
    const rowsHost = externalRowsHost();
    if (rowsHost.refresh === refreshExternalRows) rowsHost.refresh = undefined;
    if (widgetInterval) {
      clearInterval(widgetInterval);
      widgetInterval = null;
      (globalThis as any)[WIDGET_INTERVAL_KEY] = null;
    }
    if (statusInterval) {
      clearInterval(statusInterval);
      statusInterval = null;
      (globalThis as any)[STATUS_INTERVAL_KEY] = null;
    }
    const moduleAbort = (globalThis as any)[POLL_ABORT_KEY] as
      | AbortController
      | undefined;
    if (moduleAbort) moduleAbort.abort();
    for (const [_id, agent] of runningSubagents) {
      agent.abortController?.abort();
      // A sandbox must not outlive the session that made it; its TTL is
      // only the backstop for a crash.
      if (agent.sandbox && !agent.sandboxReleased) {
        agent.sandboxReleased = true;
        destroySandboxDetached(agent.sandbox);
      }
    }
    runningSubagents.clear();
  });

  // The spawning tools are always registered here. Whether a child process can
  // actually see/use them is governed by the parent's `--tools` allowlist and
  // by which extensions are loaded into the child (default-deny --no-extensions
  // + explicit -e). See launchSubagent().

  // ── subagent tool ──
  pi.registerTool({
    name: "subagent",
    label: "Subagent",
    description:
      "Spawn a subagent as a dedicated window in the shared _pi-agents tmux session. " +
      "This is a fire-and-forget async tool: the call returns immediately with only an acknowledgement. " +
      "When the sub-agent finishes, the harness AUTOMATICALLY delivers its result as a steer message that wakes you up and starts a new turn — you do not need to do anything to receive it. " +
      "The subagent then STAYS OPEN by default: send follow-up work with subagent_message, and call subagent_close once you have accepted its result. Pass keepAlive: false for a one-shot run that closes itself. " +
      "Pass skills when the task needs specialized guidance, for example principles for an architecture choice or typescript-best-practices for TypeScript edits. Use { name, scope: 'global' | 'local' } to choose a skill source. " +
      "DO NOT write polling loops, sleep/wait commands, tail/watch scripts, or repeatedly read session/log files to detect completion. DO NOT call subagents_list or any other tool to 'check' status. All of that is wasted work — the harness handles delivery for you. " +
      "DO NOT fabricate, assume, or summarize results after calling this tool. " +
      "After spawning, either end your turn immediately, or work on other independent tasks (including spawning more subagents in parallel). The harness will wake you with the result when it is ready.",
    promptSnippet:
      "Spawn a subagent as a dedicated window in the shared _pi-agents tmux session. " +
      "This is a fire-and-forget async tool: the call returns immediately with only an acknowledgement. " +
      "When the sub-agent finishes, the harness AUTOMATICALLY delivers its result as a steer message that wakes you up and starts a new turn — you do not need to do anything to receive it. " +
      "The subagent then STAYS OPEN by default: send follow-up work with subagent_message, and call subagent_close once you have accepted its result. Pass keepAlive: false for a one-shot run that closes itself. " +
      "Pass skills when the task needs specialized guidance, for example principles for an architecture choice or typescript-best-practices for TypeScript edits. Use { name, scope: 'global' | 'local' } to choose a skill source. " +
      "DO NOT write polling loops, sleep/wait commands, tail/watch scripts, or repeatedly read session/log files to detect completion. DO NOT call subagents_list or any other tool to 'check' status. All of that is wasted work — the harness handles delivery for you. " +
      "DO NOT fabricate, assume, or summarize results after calling this tool. " +
      "After spawning, either end your turn immediately, or work on other independent tasks (including spawning more subagents in parallel). The harness will wake you with the result when it is ready.",
    parameters: SubagentParams,

    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      params.agent =
        params.profile?.trim() || params.agent?.trim() || "general";
      params.isolation = params.isolation ?? "shared";

      // Prevent self-spawning (e.g. planner spawning another planner)
      const currentAgent = process.env.PI_SUBAGENT_AGENT;
      if (params.agent && currentAgent && params.agent === currentAgent) {
        return {
          content: [
            {
              type: "text",
              text: `You are the ${currentAgent} agent — do not start another ${currentAgent}. You were spawned to do this work yourself. Complete the task directly.`,
            },
          ],
          details: { error: "self-spawn blocked" },
        };
      }

      // Strict whitelist at every depth. The caller's permitted set is:
      //   • a restricted subagent (PI_SUBAGENT_ALLOWED) → only its pinned agents;
      //   • a top-level session → every discoverable agent, i.e. exactly what
      //     `subagents_list` shows.
      // Every spawn must name an agent in that set. The lone exception is a
      // top-level `fork: true` clone, which has no role and inherits the
      // caller's own already-trusted toolset. Without this guard a missing or
      // unknown `agent` silently launches an unrestricted, full-toolset child.
      const permittedAgents = SUBAGENT_ALLOWLIST
        ? [...SUBAGENT_ALLOWLIST]
        : discoverAgentDefinitions().map((a) => a.name);
      const permittedSet = new Set(permittedAgents);
      const permittedList = permittedAgents.join(", ") || "(none)";

      if (!params.agent) {
        return {
          content: [
            {
              type: "text",
              text:
                `You must specify which agent to spawn via the "agent" field. ` +
                `Available agents: ${permittedList}.`,
            },
          ],
          details: { error: "agent required" },
        };
      } else if (!permittedSet.has(params.agent)) {
        return {
          content: [
            {
              type: "text",
              text:
                `You may not spawn the "${params.agent}" agent — it is not ` +
                `${SUBAGENT_ALLOWLIST ? "in your allowlist" : "a known agent"}. ` +
                `Available agents: ${permittedList}.`,
            },
          ],
          details: {
            error: SUBAGENT_ALLOWLIST
              ? "agent not in allowlist"
              : "unknown agent",
          },
        };
      }

      let skillCandidates: SkillCandidate[] = [];
      if (params.skills?.length) {
        try {
          skillCandidates = await discoverSkillCandidates({
            cwd: ctx.cwd,
            agentDir: getAgentConfigDir(),
            projectTrusted: ctx.isProjectTrusted(),
            activeCommands: pi.getCommands(),
          });
        } catch (error) {
          const message =
            error instanceof Error ? error.message : String(error);
          return {
            content: [
              { type: "text", text: `Could not discover skills: ${message}` },
            ],
            details: { error: "skill discovery failed" },
          };
        }
      }
      const selectedSkills = resolveRequestedSkills(
        params.skills,
        skillCandidates,
      );
      if (!selectedSkills.ok) {
        return {
          content: [{ type: "text", text: selectedSkills.error }],
          details: { error: "invalid skills" },
        };
      }
      let skillBlock = "";
      try {
        skillBlock = renderSkillBlocks(selectedSkills.skills);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return {
          content: [
            { type: "text", text: `Could not read selected skill: ${message}` },
          ],
          details: { error: "skill read failed" },
        };
      }

      // Validate prerequisites (need mux + a session file to derive the
      // artifact dir that hosts this session's name registry).
      if (!isMuxAvailable()) {
        return muxUnavailableResult();
      }

      if (!ctx.sessionManager.getSessionFile()) {
        return {
          content: [
            {
              type: "text",
              text: "Error: no session file. Start pi with a persistent session to use subagents.",
            },
          ],
          details: { error: "no session file" },
        };
      }

      // This spawner session's artifact dir hosts its persistent name
      // registry (artifacts/<parentSessionId>/subagent-registry.json).
      const parentArtifactDir = getArtifactDir(
        ctx.sessionManager.getSessionDir(),
        ctx.sessionManager.getSessionId(),
      );

      // Default the cosmetic pane label to the agent name when omitted,
      // disambiguating against running subagents, in-flight reservations, and
      // every name already in the registry — so names stay unique across the
      // whole session, running or finished. Reserve the chosen name
      // synchronously (before any await) so parallel spawns don't collide.
      let reservedName: string | null = null;
      if (!params.name?.trim()) {
        const registryNames = new Set(
          Object.keys(readNameRegistry(parentArtifactDir)),
        );
        params.name = uniqueRunningName(taskName(params.task), registryNames);
        reservedName = params.name;
        reservedNames.add(reservedName);
      }

      // Container isolation: check the options, then build the sandbox
      // before the child exists, so a failure leaves nothing running.
      let sandbox: Sandbox | undefined;
      if (params.isolation === "container") {
        const agentDefs = loadAgentDefaults(params.agent ?? "general");
        const check = checkContainerSpawn({
          cli: agentDefs?.cli,
          sessionMode: resolveEffectiveSessionMode(params, agentDefs),
          branch: params.branch,
          cwd: params.cwd,
        });
        let source: SandboxSource | null = null;
        try {
          if (!check.ok) throw new Error(check.error);
          source = params.source ? parseSource(params.source, ctx.cwd) : null;
          const network: SandboxNetwork = params.network ?? "offline";
          sandbox = await createSandbox({
            name: params.name ?? "audit",
            id: Math.random().toString(16).slice(2, 8),
            network,
            source,
          });
        } catch (error) {
          if (reservedName) reservedNames.delete(reservedName);
          const message = error instanceof Error ? error.message : String(error);
          return {
            content: [{ type: "text", text: `Could not create sandbox: ${message}` }],
            details: { error: "sandbox failed" },
          };
        }
      } else if (profileNeedsContainer(loadAgentDefaults(params.agent ?? "general")?.tools)) {
        if (reservedName) reservedNames.delete(reservedName);
        return {
          content: [
            {
              type: "text",
              text: `Profile "${params.agent}" runs only in a sandbox. Spawn it with isolation: "container" (and source/network as needed).`,
            },
          ],
          details: { error: "profile needs container isolation" },
        };
      } else if (params.source || params.network) {
        if (reservedName) reservedNames.delete(reservedName);
        return {
          content: [
            {
              type: "text",
              text: '"source" and "network" only apply with isolation: "container".',
            },
          ],
          details: { error: "invalid isolation options" },
        };
      }

      // Launch the subagent (creates pane, sends command). Release the name
      // reservation once it registers in runningSubagents (or launch fails) —
      // from then on uniqueRunningName tracks it via the running map.
      let running;
      try {
        running = await launchSubagent(params, ctx, {
          skillBlock,
          selectedSkills: selectedSkills.skills,
          sandbox,
        });
      } catch (error) {
        if (sandbox) await destroySandbox(sandbox).catch(() => {});
        throw error;
      } finally {
        if (reservedName) reservedNames.delete(reservedName);
      }

      // Persist name → session so subagent_message({ name }) can resume this
      // subagent after it finishes (and after a pi restart). Done at launch,
      // not completion, so the handle exists even if the parent dies mid-run.
      registerName(parentArtifactDir, running.name, {
        sessionFile: running.sessionFile,
        sessionId: getSessionId(running.sessionFile),
      });

      // Create a separate AbortController for the watcher
      // (the tool's signal completes when we return)
      const watcherAbort = new AbortController();
      running.abortController = watcherAbort;

      // Start widget refresh and status supervision when the first agent launches
      startWidgetRefresh();
      startStatusRefresh(pi);

      // Fire-and-forget: start watching in background
      watchSubagent(running, watcherAbort.signal)
        .then((result) => {
          updateWidget(); // reflect removal from Map immediately
          if (!handleFinalDelivery(pi, running, result)) return;
          if (autoResumeAfterCrash(running, result)) return;

          const presentation = resolveResultPresentation(result, running.name);

          pi.sendMessage(
            {
              customType: "subagent_result",
              content: withReleaseNote(presentation, running),
              display: true,
              details: {
                name: running.name,
                task: running.task,
                agent: running.agent,
                exitCode: result.exitCode,
                elapsed: result.elapsed,
                sessionFile: result.sessionFile,
                ...(result.sessionId ? { sessionId: result.sessionId } : {}),
                ...(result.errorMessage
                  ? { errorMessage: result.errorMessage }
                  : {}),
                ...(result.claudeSessionId
                  ? { claudeSessionId: result.claudeSessionId }
                  : {}),
                ...(result.stats ? { stats: result.stats } : {}),
              },
            },
            { triggerTurn: true, deliverAs: "steer" },
          );
        })
        .catch((err) => {
          updateWidget();
          if (running.closeReason) return;
          pi.sendMessage(
            {
              customType: "subagent_result",
              content: withReleaseNote(
                `Sub-agent "${running.name}" error: ${err?.message ?? String(err)}`,
                running,
              ),
              display: true,
              details: {
                name: running.name,
                task: running.task,
                error: err?.message,
              },
            },
            { triggerTurn: true, deliverAs: "steer" },
          );
        });

      // Return immediately
      return {
        content: [
          {
            type: "text",
            text:
              `Sub-agent "${params.name}" launched and is now running in the background. ` +
              (sandbox ? `Sandbox: ${describeSandbox(sandbox)}. ` : "") +
              `Do NOT generate or assume any results — you have no idea what the sub-agent will do or produce. ` +
              `The results will be delivered to you automatically as a steer message when the sub-agent finishes. ` +
              `Until then, move on to other work or tell the user you're waiting.`,
          },
        ],
        details: {
          id: running.id,
          name: params.name,
          task: params.task,
          agent: params.agent,
          sessionFile: running.sessionFile,
          launchScriptFile: running.launchScriptFile,
          status: "started",
        },
      };
    },

    renderCall(args, theme) {
      const partialArgs = args as Record<string, unknown>;
      const agentName =
        typeof partialArgs.agent === "string" && partialArgs.agent
          ? partialArgs.agent
          : "";
      const name =
        typeof partialArgs.name === "string" && partialArgs.name
          ? partialArgs.name
          : agentName || "(unnamed)";
      const task = typeof partialArgs.task === "string" ? partialArgs.task : "";
      // Only show the agent tag separately when a distinct cosmetic name was given.
      const agent =
        agentName && name !== agentName
          ? theme.fg("dim", ` (${agentName})`)
          : "";
      const cwdHint =
        typeof partialArgs.cwd === "string" && partialArgs.cwd
          ? theme.fg("dim", ` in ${partialArgs.cwd}`)
          : "";
      let text =
        "○ " + theme.fg("toolTitle", theme.bold(name)) + agent + cwdHint;

      // Show a one-line task preview. renderCall is called repeatedly as the
      // LLM generates tool arguments, so args.task grows token by token.
      // We keep it compact here — Ctrl+O on renderResult expands the full content.
      if (task) {
        const firstLine = task.split("\n").find((l: string) => l.trim()) ?? "";
        const preview =
          firstLine.length > 100 ? firstLine.slice(0, 100) + "…" : firstLine;
        if (preview) {
          text += "\n" + theme.fg("toolOutput", preview);
        }
        const totalLines = task.split("\n").length;
        if (totalLines > 1) {
          text += theme.fg("muted", ` (${totalLines} lines)`);
        }
      }

      return new Text(text, 0, 0);
    },

    renderResult(result, _opts, theme) {
      const details = result.details as any;
      const name = details?.name ?? "(unnamed)";

      // "Started" result — tool returned immediately
      if (details?.status === "started") {
        return new Text(
          theme.fg("accent", "⟳") +
            " " +
            theme.fg("toolTitle", theme.bold(name)) +
            theme.fg("dim", " — started"),
          0,
          0,
        );
      }

      // Fallback (shouldn't happen)
      const text =
        typeof result.content[0]?.text === "string"
          ? result.content[0].text
          : "";
      return new Text(theme.fg("dim", text), 0, 0);
    },
  });

  // ── subagents_list tool ──
  pi.registerTool({
    name: "subagents_list",
    label: "List Subagents",
    description:
      "List all available subagent definitions. " +
      "Scans project-local .pi/agents/ and global ~/.pi/agent/agents/. " +
      "Project-local agents override global ones with the same name.",
    promptSnippet:
      "List all available subagent definitions. " +
      "Scans project-local .pi/agents/ and global ~/.pi/agent/agents/. " +
      "Project-local agents override global ones with the same name.",
    parameters: Type.Object({}),

    async execute() {
      const list = discoverAgentDefinitions().filter(
        (agent) => !agent.disableModelInvocation,
      );

      if (list.length === 0) {
        return {
          content: [{ type: "text", text: "No subagent definitions found." }],
          details: { agents: [] },
        };
      }

      const lines = list.map((a) => {
        const badge = a.source === "project" ? " (project)" : "";
        const desc = a.description ? ` — ${a.description}` : "";
        const model = a.model ? ` [${a.model}]` : "";
        return `• ${a.name}${badge}${model}${desc}`;
      });

      return {
        content: [{ type: "text", text: lines.join("\n") }],
        details: { agents: list },
      };
    },

    renderResult(result, _opts, theme) {
      const details = result.details as any;
      const agents = details?.agents ?? [];
      if (agents.length === 0) {
        return new Text(
          theme.fg("dim", "No subagent definitions found."),
          0,
          0,
        );
      }
      const lines = agents.map((a: any) => {
        const badge =
          a.source === "project" ? theme.fg("accent", " (project)") : "";
        const desc = a.description
          ? theme.fg("dim", ` — ${a.description}`)
          : "";
        const model = a.model ? theme.fg("dim", ` [${a.model}]`) : "";
        return `  ${theme.fg("toolTitle", theme.bold(a.name))}${badge}${model}${desc}`;
      });
      return new Text(lines.join("\n"), 0, 0);
    },
  });

  // ── subagent_attach tool ──
  pi.registerTool({
    name: "subagent_attach",
    label: "Attach Subagent",
    description:
      "Open a running subagent from the shared _pi-agents tmux session in a popup.",
    parameters: Type.Object({
      name: Type.String({ description: "Stable subagent name." }),
    }),
    async execute(_toolCallId, params) {
      try {
        attachSurface(params.name);
        return {
          content: [
            { type: "text", text: `Opened subagent "${params.name}".` },
          ],
          details: { name: params.name, status: "attached" },
        };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return {
          content: [{ type: "text", text: message }],
          details: { error: message },
        };
      }
    },
  });

  pi.registerCommand("subagent-attach", {
    description: "Open a subagent window from _pi-agents in a popup",
    handler: async (args, ctx) => {
      const name = args.trim();
      if (!name) {
        ctx.ui.notify("Usage: /subagent-attach <name>", "warning");
        return;
      }
      try {
        attachSurface(name);
      } catch (error) {
        ctx.ui.notify(
          error instanceof Error ? error.message : String(error),
          "error",
        );
      }
    },
  });


  /**
   * Resume a finished subagent session by its registered name. Used by
   * subagent_message and by the automatic resume after a crash.
   */
  async function resumeFinishedSubagent({
    requestedName,
    message,
    parentArtifactDir,
    crashResumes = 0,
  }: {
    requestedName: string;
    message: string;
    parentArtifactDir: string;
    /** Automatic resumes already spent on crashes in this chain. */
    crashResumes?: number;
  }) {
    const name = requestedName; // identity preservation: the resumed run reclaims its name
    const { autoExit, interactive } = resolveResumeLaunchBehavior();
    const startTime = Date.now();
    const id = Math.random().toString(16).slice(2, 10);

    // Resolve the name to its session file via this session's registry.
    const entry = resolveNameInRegistry(parentArtifactDir, requestedName);
    if (!entry) {
      const known = Object.keys(readNameRegistry(parentArtifactDir));
      const err =
        `No subagent named "${requestedName}" in this session. ` +
        (known.length > 0
          ? `Known subagents: ${known.join(", ")}.`
          : "No subagents have been spawned in this session yet.");
      return {
        content: [{ type: "text" as const, text: err }],
        details: { error: err },
      };
    }

    const sessionPath = entry.sessionFile;
    if (!sessionPath || !existsSync(sessionPath)) {
      const err =
        `Subagent "${requestedName}" is registered but its session file is gone ` +
        `(${sessionPath}). It cannot be resumed. Spawn a fresh subagent instead.`;
      return {
        content: [{ type: "text" as const, text: err }],
        details: { error: err },
      };
    }

    // Guard: never resume a session that is still running — two processes
    // mutating the same .jsonl corrupts it. Steer it by name instead.
    for (const r of runningSubagents.values()) {
      if (resolve(r.sessionFile) === resolve(sessionPath)) {
        const err = `Subagent "${requestedName}" is still running as "${r.name}". Your message will steer it; resending as a steer.`;
        return handleSubagentSteer({ name: r.name, message });
      }
    }

    // Reconstruct the sandbox from the snapshot written at spawn time.
    // Without it we cannot safely resume: relaunching bare would load every
    // global extension + the full toolset. Refuse rather than escalate.
    const loadout = readSubagentLoadout(sessionPath);
    if (!loadout) {
      const err =
        `Cannot safely resume "${requestedName}": no sandbox snapshot found for this session ` +
        `(it predates sandboxed resume, or its .loadout.json sidecar was removed). ` +
        `Resuming would relaunch with all global extensions and the full toolset, so this is refused. ` +
        `Re-run the task as a fresh subagent instead.`;
      return {
        content: [{ type: "text" as const, text: err }],
        details: { error: err },
      };
    }

    // A worktree subagent's clean worktree was removed when it closed; its
    // branch was kept. Recreate the worktree at the same path on that branch
    // so the resumed agent runs where it did before.
    let resumeWorktree: SubagentWorktree | undefined;
    const savedWorktree = loadout.worktree;
    if (loadout.isolation === "worktree" && savedWorktree?.repoRoot) {
      try {
        resumeWorktree = reattachSubagentWorktree({
          id: savedWorktree.id,
          repoRoot: savedWorktree.repoRoot,
          path: savedWorktree.path,
          branch: savedWorktree.branch,
        });
      } catch (error) {
        const err =
          `Cannot resume "${requestedName}" in its worktree: ` +
          (error instanceof Error ? error.message : String(error));
        return {
          content: [{ type: "text" as const, text: err }],
          details: { error: err },
        };
      }
    }

    // A container subagent's sandbox was removed when it closed. Build a
    // fresh one from the saved source and network before anything starts.
    let resumeSandbox: Sandbox | undefined;
    if (loadout.isolation === "container") {
      if (!loadout.container) {
        const err = `Cannot resume "${requestedName}": its snapshot has no sandbox settings. Spawn a fresh container subagent instead.`;
        return {
          content: [{ type: "text" as const, text: err }],
          details: { error: err },
        };
      }
      try {
        resumeSandbox = await createSandbox({
          name,
          id: Math.random().toString(16).slice(2, 8),
          network: loadout.container.network,
          source: loadout.container.source,
        });
      } catch (error) {
        const err =
          `Cannot resume "${requestedName}": could not create its sandbox: ` +
          (error instanceof Error ? error.message : String(error));
        return {
          content: [{ type: "text" as const, text: err }],
          details: { error: err },
        };
      }
      if (loadout.cwd) mkdirSync(loadout.cwd, { recursive: true });
    }

    // Until `running` owns the new sandbox, a throw here would leak it.
    try {
      const resumedSessionId =
        entry.sessionId ?? getSessionId(sessionPath) ?? requestedName;

      // Record entry count before resuming so we can extract new messages.
      // Count lines cheaply (no per-line JSON.parse) so resuming a large
      // transcript doesn't block the UI.
      const entryCountBefore = countSessionEntryLines(sessionPath);

      const surface = createSurface(name);
      await new Promise<void>((resolve) =>
        setTimeout(resolve, getShellReadyDelayMs()),
      );

      // Build pi resume command
      const parts = ["pi", "--session", shellEscape(sessionPath)];

      // Load subagent-done extension so the agent can self-terminate if needed
      const subagentDonePath = join(SUBAGENTS_DIR, "subagent-done.ts");
      parts.push("-e", shellEscape(subagentDonePath));

      const artifactDir = parentArtifactDir;
      const activityFile = getSubagentActivityFile(artifactDir, id);
      mkdirSync(dirname(activityFile), { recursive: true });

      // Replay the model, identity, and default-deny tool/extension sandbox.
      applySandboxToParts(parts, loadout, { artifactDir, name });

      let resumeMsgFile: string | undefined;
      if (message) {
        const msgTimestamp = new Date()
          .toISOString()
          .replace(/[:.]/g, "-")
          .slice(0, 19);
        resumeMsgFile = join(
          artifactDir,
          "subagent-resume",
          `${
            name
              .toLowerCase()
              .replace(/[^a-z0-9\s-]/g, "")
              .replace(/\s+/g, "-")
              .replace(/-+/g, "-")
              .replace(/^-|-$/g, "") || "resume"
          }-${msgTimestamp}.md`,
        );
        mkdirSync(dirname(resumeMsgFile), { recursive: true });
        writeFileSync(
          resumeMsgFile,
          resumeSandbox
            ? `${sandboxBriefing(resumeSandbox, { recreated: true })}\n\n${message}`
            : message,
          "utf8",
        );
        parts.push(shellEscape(`@${resumeMsgFile}`));
      }

      // Build env prefix — replay the snapshot's config dir + spawn whitelist
      // so the resumed process resolves the same agents/extensions and keeps
      // the same nested-spawn restriction it originally ran with.
      const resumeEnvParts: string[] = [];
      if (resumeSandbox) {
        for (const [key, value] of Object.entries(containerChildEnv(resumeSandbox))) {
          resumeEnvParts.push(`${key}=${shellEscape(value)}`);
        }
      }
      const resumeAgentDir =
        loadout.agentDir ?? process.env.PI_CODING_AGENT_DIR ?? null;
      if (resumeAgentDir) {
        resumeEnvParts.push(
          `PI_CODING_AGENT_DIR=${shellEscape(resumeAgentDir)}`,
        );
      }
      if (loadout.spawnable && loadout.spawnable.length > 0) {
        resumeEnvParts.push(
          `PI_SUBAGENT_ALLOWED=${shellEscape(loadout.spawnable.join(","))}`,
        );
      }
      if (loadout.agent) {
        resumeEnvParts.push(`PI_SUBAGENT_AGENT=${shellEscape(loadout.agent)}`);
      }
      resumeEnvParts.push(`PI_SUBAGENT_DEPTH=${currentSubagentDepth() + 1}`);
      resumeEnvParts.push(
        `PI_SUBAGENT_ISOLATION=${shellEscape(loadout.isolation ?? "shared")}`,
      );
      resumeEnvParts.push(`PI_SUBAGENT_NAME=${shellEscape(name)}`);
      resumeEnvParts.push(`PI_SUBAGENT_SESSION=${shellEscape(sessionPath)}`);
      resumeEnvParts.push(`PI_SUBAGENT_ID=${shellEscape(id)}`);
      resumeEnvParts.push(
        `PI_SUBAGENT_ACTIVITY_FILE=${shellEscape(activityFile)}`,
      );
      if (autoExit) {
        resumeEnvParts.push(`PI_SUBAGENT_AUTO_EXIT=1`);
      }
      // A spawn that opted out of keep-alive stays one-shot when resumed;
      // older snapshots without the field follow the config default.
      const resumeKeepAlive = resolveKeepAlive({
        requested: loadout.keepAlive,
        autoExit,
        config: keepAliveConfig,
      });
      if (resumeKeepAlive) {
        resumeEnvParts.push(`PI_SUBAGENT_KEEP_ALIVE=1`);
      }
      const resumeEnvPrefix = resumeEnvParts.join(" ") + " ";

      // Resume in the subagent's original cwd so its tools (safe_bash, edits)
      // operate where they did before.
      const resumeCdPrefix = loadout.cwd
        ? `cd ${shellEscape(loadout.cwd)} && `
        : "";

      const command = wrapSubagentCommand(
        `${resumeCdPrefix}${resumeEnvPrefix}${parts.join(" ")}`,
        exitStatusFile(sessionPath),
      );
      const launchScriptFile = join(
        artifactDir,
        "subagent-scripts",
        `${
          name
            .toLowerCase()
            .replace(/[^a-z0-9\s-]/g, "")
            .replace(/\s+/g, "-")
            .replace(/-+/g, "-")
            .replace(/^-|-$/g, "") || "resume"
        }-resume-${Date.now()}.sh`,
      );
      sendLongCommand(surface, command, {
        scriptPath: launchScriptFile,
        scriptPreamble: [
          `# Subagent resume script for ${name}`,
          `# Generated: ${new Date().toISOString()}`,
          `# Session: ${sessionPath}`,
          `# Surface: ${surface}`,
          ...(resumeMsgFile ? [`# Resume message file: ${resumeMsgFile}`] : []),
        ].join("\n"),
      });

      // Register as a running subagent for widget tracking
      const running: RunningSubagent = {
        id,
        name,
        task: message,
        surface,
        startTime,
        sessionFile: sessionPath,
        launchScriptFile,
        activityFile,
        interactive,
        keepAlive: resumeKeepAlive,
        deliveredEntryCount: entryCountBefore,
        turnsDelivered: 0,
        artifactDir: parentArtifactDir,
        crashResumes,
        ...(resumeWorktree ? { worktree: resumeWorktree } : {}),
        ...(resumeSandbox ? { sandbox: resumeSandbox } : {}),
        statusState: createStatusState({
          source: "pi",
          startTimeMs: startTime,
        }),
      };
      runningSubagents.set(id, running);
      startWidgetRefresh();
      startStatusRefresh(pi);

      // Fire-and-forget watcher
      const watcherAbort = new AbortController();
      running.abortController = watcherAbort;

      watchSubagent(running, watcherAbort.signal)
        .then((result) => {
          updateWidget();
          if (!handleFinalDelivery(pi, running, result)) return;
          if (autoResumeAfterCrash(running, result)) return;

          const allEntries = getNewEntries(sessionPath, entryCountBefore);
          const summary =
            findLastAssistantMessage(allEntries) ??
            (result.errorMessage
              ? `Subagent error: ${result.errorMessage}`
              : result.exitCode !== 0
                ? `Resumed session exited with code ${result.exitCode}`
                : "Resumed session exited without new output");
          const presentation = resolveResultPresentation(
            {
              ...result,
              summary,
              sessionFile: sessionPath,
              sessionId: resumedSessionId,
            },
            name,
          );
          const gaveUp =
            result.crashed && crashResumes >= MAX_CRASH_RESUMES
              ? `\n\nIt crashed ${crashResumes + 1} times in a row; automatic resume stopped after ${MAX_CRASH_RESUMES} attempts.`
              : "";

          pi.sendMessage(
            {
              customType: "subagent_result",
              content: withReleaseNote(presentation + gaveUp, running),
              display: true,
              details: {
                name,
                task: message,
                exitCode: result.exitCode,
                elapsed: result.elapsed,
                sessionFile: sessionPath,
                sessionId: resumedSessionId,
                ...(result.errorMessage
                  ? { errorMessage: result.errorMessage }
                  : {}),
              },
            },
            { triggerTurn: true, deliverAs: "steer" },
          );
        })
        .catch((err) => {
          updateWidget();
          if (running.closeReason) return;
          pi.sendMessage(
            {
              customType: "subagent_result",
              content: withReleaseNote(
                `Resume error: ${err?.message ?? String(err)}`,
                running,
              ),
              display: true,
              details: { name, error: err?.message },
            },
            { triggerTurn: true, deliverAs: "steer" },
          );
        });

      return {
        content: [{ type: "text", text: `Session "${name}" resumed.` }],
        details: {
          id,
          name,
          sessionId: resumedSessionId,
          sessionFile: sessionPath,
          launchScriptFile,
          status: "started",
        },
      };
    } catch (error) {
      if (resumeSandbox && !runningSubagents.has(id)) destroySandboxDetached(resumeSandbox);
      throw error;
    }
  }

  /**
   * After a crash mid-turn, tell the orchestrator and resume the subagent
   * once with a standard recovery message. Returns true when it took over
   * delivery (the crash result is then sent only if the resume fails).
   */
  function autoResumeAfterCrash(
    running: RunningSubagent,
    result: SubagentResult,
  ): boolean {
    if (!shouldAutoResume(running, result) || !running.artifactDir) return false;
    const attempt = (running.crashResumes ?? 0) + 1;
    const notice =
      `Sub-agent "${running.name}" crashed (exit ${result.exitCode}): ` +
      `${result.errorMessage ?? "no error captured"}. ` +
      `Resuming it automatically (attempt ${attempt} of ${MAX_CRASH_RESUMES}).`;
    pi.sendMessage(
      {
        customType: "subagent_status",
        content: notice,
        display: true,
        details: { lines: [notice], overflow: 0 },
      },
      { triggerTurn: false },
    );
    const deliverCrash = (why: string) =>
      pi.sendMessage(
        {
          customType: "subagent_result",
          content: `${resolveResultPresentation(result, running.name)}\n\nAutomatic resume failed: ${why}`,
          display: true,
          details: {
            name: running.name,
            task: running.task,
            exitCode: result.exitCode,
            elapsed: result.elapsed,
            sessionFile: result.sessionFile,
            ...(result.errorMessage ? { errorMessage: result.errorMessage } : {}),
          },
        },
        { triggerTurn: true, deliverAs: "steer" },
      );
    resumeFinishedSubagent({
      requestedName: running.name,
      message: crashResumeMessage(result),
      parentArtifactDir: running.artifactDir,
      crashResumes: attempt,
    })
      .then((res) => {
        const error = (res.details as { error?: string } | undefined)?.error;
        if (error) deliverCrash(error);
      })
      .catch((err) => deliverCrash(err instanceof Error ? err.message : String(err)));
    return true;
  }

  // ── subagent_message tool ──
  pi.registerTool({
    name: "subagent_message",
    label: "Message Subagent",
    description:
      "Send a message to a subagent by name. Names are unique within your session and persist after a subagent finishes, " +
      "so the SAME name works whether the subagent is running or finished: if it is still running, your message steers its live session; " +
      "if it has finished, your message resumes that session and continues it. " +
      "`name` and `message` are both required. " +
      "Messaging an open subagent (including one idle after delivering a result) returns immediately; its next result arrives as a steer message when its turn ends. " +
      "Resuming is a fire-and-forget async call: when the resumed sub-agent finishes, the harness AUTOMATICALLY delivers its result as a steer message that wakes you up. " +
      "Call subagent_close when you no longer need an open subagent. " +
      "DO NOT poll, sleep, tail logs, or read session files to detect completion — the harness handles delivery. " +
      "DO NOT fabricate or assume results. After calling, either end your turn or work on other independent tasks.",
    promptSnippet:
      "Message a subagent by name: steers it if running, resumes it if finished (same name either way). " +
      "`name` and `message` are required. Steering returns immediately; resuming delivers its result later as a steer message. " +
      "Do not poll or fabricate results.",
    parameters: Type.Object({
      name: Type.String({
        description:
          "Exact display name of the subagent. Steers it if it is still running; resumes its session if it has finished.",
      }),
      message: Type.String({
        description:
          "The message to deliver: a follow-up instruction for a running subagent, or the next task for a resumed session.",
      }),
    }),

    renderCall(args, theme) {
      const target = args.name ?? "(unknown)";
      return new Text(
        "○ " +
          theme.fg("toolTitle", theme.bold(target)) +
          theme.fg("dim", " — message"),
        0,
        0,
      );
    },

    renderResult(result, _opts, theme) {
      const details = result.details as any;

      if (details?.status === "steered") {
        return new Text(
          theme.fg("success", "✓") +
            " " +
            theme.fg("toolTitle", theme.bold(details.name ?? "subagent")) +
            theme.fg("dim", " — message delivered"),
          0,
          0,
        );
      }

      if (details?.status === "started") {
        return new Text(
          theme.fg("accent", "⟳") +
            " " +
            theme.fg("toolTitle", theme.bold(details.name ?? "Resume")) +
            theme.fg("dim", " — resumed"),
          0,
          0,
        );
      }

      // Fallback / error
      const text =
        typeof result.content[0]?.text === "string"
          ? result.content[0].text
          : "";
      return new Text(theme.fg("dim", text), 0, 0);
    },

    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      const requestedName = params.name?.trim();
      if (!requestedName) {
        const err =
          "Provide the subagent's `name` to steer (if running) or resume (if finished).";
        return {
          content: [{ type: "text" as const, text: err }],
          details: { error: err },
        };
      }

      if (!isMuxAvailable()) {
        return muxUnavailableResult();
      }

      // ── Steer a running subagent ──
      // A name that matches a currently-running subagent always steers it.
      const runningMatch = Array.from(runningSubagents.values()).find(
        (r) => r.name === requestedName,
      );
      if (runningMatch) {
        return handleSubagentSteer({
          name: requestedName,
          message: params.message,
        });
      }
      // Parent restarts lose the in-memory map, but the hidden tmux window may still be alive.
      if (surfaceAlive(requestedName)) {
        try {
          sendCommand(
            requestedName,
            params.message.replace(/\s*\n\s*/g, " ").trim(),
          );
          return {
            content: [
              {
                type: "text",
                text: `Message delivered to running subagent "${requestedName}".`,
              },
            ],
            details: { name: requestedName, status: "steered" },
          };
        } catch (error) {
          const message =
            error instanceof Error ? error.message : String(error);
          return {
            content: [{ type: "text", text: message }],
            details: { error: message },
          };
        }
      }

      // ── Resume a finished session by name ──
      return resumeFinishedSubagent({
        requestedName,
        message: params.message,
        parentArtifactDir: getArtifactDir(
          ctx.sessionManager.getSessionDir(),
          ctx.sessionManager.getSessionId(),
        ),
      });
    },
  });

  // ── subagent_close tool ──
  pi.registerTool({
    name: "subagent_close",
    label: "Close Subagent",
    description:
      "Close a subagent: ends its pi process and its tmux window. Subagents stay open after delivering a result so you can send " +
      "follow-up work with subagent_message; call this once you have accepted the result and need nothing more from it, or to " +
      "stop one that is going the wrong way. Its session is saved, so subagent_message({ name }) can resume it later. " +
      "A subagent that is still working mid-turn is only closed with force: true.",
    promptSnippet:
      "Close a subagent by name once you have accepted its result (force: true stops one mid-turn). Its session stays resumable.",
    parameters: Type.Object({
      name: Type.String({
        description: "Exact display name of the subagent to close.",
      }),
      force: Type.Optional(
        Type.Boolean({
          description:
            "Close it even if it is mid-turn. Work in progress (a running tool or an unfinished reply) is lost.",
        }),
      ),
    }),

    renderCall(args, theme) {
      const target = args.name ?? "(unknown)";
      const force = args.force ? theme.fg("warning", " (force)") : "";
      return new Text(
        "○ " +
          theme.fg("toolTitle", theme.bold(target)) +
          theme.fg("dim", " — close") +
          force,
        0,
        0,
      );
    },

    renderResult(result, _opts, theme) {
      const details = result.details as any;
      if (details?.status === "closed") {
        return new Text(
          theme.fg("success", "✓") +
            " " +
            theme.fg("toolTitle", theme.bold(details.name ?? "subagent")) +
            theme.fg("dim", details.forced ? " — closed mid-turn" : " — closed"),
          0,
          0,
        );
      }
      const text =
        typeof result.content[0]?.text === "string"
          ? result.content[0].text
          : "";
      return new Text(theme.fg("dim", text), 0, 0);
    },

    async execute(_toolCallId, params) {
      return closeSubagentByName(params);
    },
  });

  // /subagent command — the orchestrator chooses task, context, and optional profile.
  pi.registerCommand("subagent", {
    description: "Spawn a general subagent: /subagent <task>",
    handler: async (args, ctx) => {
      const task = args.trim();
      if (!task) {
        ctx.ui.notify("Usage: /subagent <task>", "warning");
        return;
      }
      pi.sendUserMessage(
        `Use the subagent tool with profile "general" and task ${JSON.stringify(task)}. Choose a short task-oriented name and include any needed context.`,
      );
    },
  });

  // ── subagent_result message renderer ──
  pi.registerMessageRenderer("subagent_result", (message, options, theme) => {
    const details = message.details as any;
    if (!details) return undefined;

    return {
      invalidate() {},
      render(width: number): string[] {
        const name = details.name ?? "subagent";
        const exitCode = details.exitCode ?? 0;
        const errorMessage =
          typeof details.errorMessage === "string" ? details.errorMessage : "";
        const failed = exitCode !== 0 || !!errorMessage;
        const elapsed =
          details.elapsed != null ? formatElapsed(details.elapsed) : "?";
        const bgFn = failed
          ? (text: string) => theme.bg("toolErrorBg", text)
          : (text: string) => theme.bg("toolSuccessBg", text);
        const stats = (details.stats ?? null) as SessionStats | null;
        const icon = failed ? theme.fg("error", "✗") : theme.fg("success", "✓");
        const agentTag = details.agent
          ? theme.fg("dim", ` (${details.agent})`)
          : "";
        const modelTag = stats?.model
          ? theme.fg("dim", ` (${stats.model})`)
          : "";
        const titleSegment = `${icon} ${theme.fg("toolTitle", theme.bold(name))}${agentTag}${modelTag} ${theme.fg("dim", "—")} `;

        // Success: icon already conveys "completed", so show "N tools · duration"
        // like the in-process extension. Failure: surface the failure reason.
        let header: string;
        if (failed) {
          const reason = errorMessage
            ? "failed (provider/agent error)"
            : `failed (exit ${exitCode})`;
          header = `${titleSegment}${theme.fg("error", reason)} ${theme.fg("dim", `· ${elapsed}`)}`;
        } else {
          const toolPart = stats
            ? `${stats.toolCount} tools · ${elapsed}`
            : elapsed;
          header = `${titleSegment}${theme.fg("dim", toolPart)}`;
        }

        // Usage line: ↑in ↓out R… W… $cost · context-gauge (color-coded by %).
        let usageLine: string | null = null;
        if (stats) {
          const segs = formatUsageSegments(stats).map((s) =>
            theme.fg("dim", s),
          );
          if (stats.contextTokens > 0) {
            const window = contextWindowFor(stats.model);
            const ctxStr = formatContextUsage(stats.contextTokens, window);
            const pct = window ? (stats.contextTokens / window) * 100 : 0;
            const coloredCtx =
              pct > 90
                ? theme.fg("error", ctxStr)
                : pct > 70
                  ? theme.fg("warning", ctxStr)
                  : theme.fg("dim", ctxStr);
            segs.push(coloredCtx);
          }
          if (segs.length > 0) usageLine = segs.join(theme.fg("dim", " "));
        }

        const rawContent =
          typeof message.content === "string" ? message.content : "";

        // Clean summary (remove follow-up ref and leading label for display)
        const summary = rawContent
          .replace(/\n\nFollow up with subagent_message[\s\S]+$/, "")
          .replace(`Sub-agent "${name}" completed (${elapsed}).\n\n`, "")
          .replace(
            `Sub-agent "${name}" failed (exit code ${exitCode}).\n\n`,
            "",
          )
          .replace(
            new RegExp(
              `^Sub-agent "${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}" failed after ${elapsed} \\(provider/agent error — auto-retry exhausted\\)\\.\\n\\n`,
            ),
            "",
          );

        // Build content for the box
        const contentLines = [header];
        if (usageLine) contentLines.push(usageLine);

        if (options.expanded) {
          // Full view: complete summary + session info
          if (summary) {
            for (const line of summary.split("\n")) {
              contentLines.push(line.slice(0, width - 6));
            }
          }
          if (details.name || details.sessionFile) {
            contentLines.push("");
            if (details.name) {
              contentLines.push(
                theme.fg(
                  "dim",
                  `Follow up:  subagent_message({ name: "${details.name}", message: "…" })`,
                ),
              );
              if (details.open) {
                contentLines.push(
                  theme.fg(
                    "dim",
                    `Close:      subagent_close({ name: "${details.name}" })`,
                  ),
                );
              }
            }
            if (details.sessionFile) {
              contentLines.push(
                theme.fg("muted", `Session file: ${details.sessionFile}`),
              );
            }
          }
        } else {
          // Collapsed: preview + expand hint
          if (summary) {
            const previewLines = summary.split("\n").slice(0, 5);
            for (const line of previewLines) {
              contentLines.push(theme.fg("dim", line.slice(0, width - 6)));
            }
            const totalLines = summary.split("\n").length;
            if (totalLines > 5) {
              contentLines.push(
                theme.fg("muted", `… ${totalLines - 5} more lines`),
              );
            }
          }
          contentLines.push(
            theme.fg("muted", keyHint("app.tools.expand", "to expand")),
          );
        }

        // Render via Box for background + padding, with blank line above for separation
        const box = new Box(1, 1, bgFn);
        box.addChild(new Text(contentLines.join("\n"), 0, 0));
        return ["", ...box.render(width)];
      },
    };
  });

  // ── subagent_status message renderer ──
  pi.registerMessageRenderer("subagent_status", (message, options, theme) => {
    const details = message.details as any;
    const lines = Array.isArray(details?.lines) ? details.lines : [];
    const overflow =
      typeof details?.overflow === "number" ? details.overflow : 0;
    if (lines.length === 0 && overflow === 0) return undefined;

    return {
      invalidate() {},
      render(width: number): string[] {
        const lineWidth = Math.max(0, width - 6);
        const contentLines = [
          `${theme.fg("accent", "•")} ${theme.fg("toolTitle", theme.bold("Subagent status"))}`,
          ...lines.map((line: string) =>
            theme.fg("dim", truncateToWidth(line, lineWidth)),
          ),
        ];

        if (overflow > 0) {
          contentLines.push(theme.fg("muted", `+${overflow} more running.`));
        }
        if (!options.expanded) {
          contentLines.push(
            theme.fg("muted", keyHint("app.tools.expand", "to expand")),
          );
        }

        const box = new Box(1, 1, (text: string) =>
          theme.bg("customMessageBg", text),
        );
        box.addChild(new Text(contentLines.join("\n"), 0, 0));
        return ["", ...box.render(width)];
      },
    };
  });

  // ── subagent_question message renderer ──
  pi.registerMessageRenderer("subagent_question", (message, options, theme) => {
    const details = message.details as any;
    if (!details) return undefined;

    return {
      invalidate() {},
      render(width: number): string[] {
        const name = details.name ?? "subagent";
        const agentTag = details.agent
          ? theme.fg("dim", ` (${details.agent})`)
          : "";
        const bgFn = (text: string) => theme.bg("toolSuccessBg", text);

        const icon = theme.fg("accent", "?");
        const header = `${icon} ${theme.fg("toolTitle", theme.bold(name))}${agentTag} ${theme.fg("dim", "— asks a question")}`;

        const contentLines = [header];

        if (options.expanded) {
          contentLines.push("");
          contentLines.push(details.question ?? "");
          contentLines.push("");
          contentLines.push(
            theme.fg(
              "dim",
              `Reply: subagent_message({ name: "${name}", message: "…" })`,
            ),
          );
        } else {
          const preview = (details.question ?? "")
            .split("\n")[0]
            .slice(0, width - 10);
          contentLines.push(theme.fg("dim", preview));
          contentLines.push(
            theme.fg("muted", keyHint("app.tools.expand", "to expand")),
          );
        }

        const box = new Box(1, 1, bgFn);
        box.addChild(new Text(contentLines.join("\n"), 0, 0));
        return ["", ...box.render(width)];
      },
    };
  });
}
