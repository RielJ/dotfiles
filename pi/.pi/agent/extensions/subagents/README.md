# Hybrid subagents

Local fork of [amosblomqvist/pi-interactive-subagents](https://github.com/amosblomqvist/pi-interactive-subagents), used under the MIT License.

Each subagent runs in its own tmux window inside one hidden `_pi-agents` session. The parent session is never split. Use `subagent_attach` to view a running agent in a popup; dismissing the popup leaves it running.

## Spawn

```ts
subagent({
  name: "oauth-refresh",
  task: "Investigate the refresh failure",
  context: "Curated facts from the parent session",
  profile: "research",
  skills: [
    "systematic-debugging",
    { name: "principles", scope: "global" },
  ],
  isolation: "shared",
})
```

`skills` is optional and has no item limit. A string uses the skill Pi loaded for the orchestrator. An object with `scope: "global"` uses a user-level skill, and `scope: "local"` uses a skill from the orchestrator's project. Scoped requests can select a skill hidden by a same-name skill in the other scope. Local skills are available only when the orchestrator's project is trusted.

The extension checks every requested skill before launch. Unknown names and missing scopes stop the spawn and report the available choices. It then reads each selected `SKILL.md` and puts the skill bodies before the task in the child's first prompt. Skills named in a profile's `skills:` frontmatter still load.

Use skills when they change how the child should work. For example, pass `principles` for an architecture decision, `typescript-best-practices` for TypeScript edits, or `systematic-debugging` for an unexplained failure. Each skill adds its full body to the child's context.

Every child prompt ends with final-report rules. The child leads with the result and keeps the evidence the orchestrator needs: changed files, `file:line` references, command results, decisive output lines, failures, and unverified items. It cuts narration, restated task text, and filler. Children do not load `caveman-milk-pi`, because compressed fragments make evidence harder to verify.

`profile` is optional and defaults to `general`. Bundled profiles are `general`, `explore`, `research`, `review`, and `implement`, plus the read-only `locator`, `analyzer`, and `pattern-finder` research profiles. Names describe tasks and remain stable for messages and resume.

## Models

Subagents run on Claude regardless of the session default in `settings.json`. Each bundled profile pins a model, and `DEFAULT_SUBAGENT_MODEL` (`anthropic/claude-sonnet-5-5`) catches any profile that omits one.

| Profile | Model |
|---|---|
| `general` | `anthropic/claude-opus-5-5` |
| `explore` | `anthropic/claude-sonnet-5-5` |
| `research` | `anthropic/claude-sonnet-5-5` |
| `review` | `anthropic/claude-opus-5-5` |
| `implement` | `anthropic/claude-opus-5-5` |
| `audit` | `anthropic/claude-opus-5-5` |

Profiles that write code, review, plan or red-team run on Opus 5.5. Read-only lookup, recon and research run on Sonnet 5.5.

Precedence is `params.model`, then the profile's `model:` frontmatter, then `DEFAULT_SUBAGENT_MODEL`. Profiles in `~/.pi/agent/agents/` shadow bundled ones of the same name. Agents with `cli: claude` are exempt, since the Claude Code CLI uses its own model naming.

`isolation` defaults to `shared`, which runs in the caller's cwd. Use `worktree` for parallel writers and `container` for code or sites you don't trust.

### Worktree isolation

`isolation: "worktree"` runs the subagent in a new git worktree at `<repo>/.pi/git-worktrees/<slug>`, where `<repo>` is the main checkout and `<slug>` is the subagent's `name` in lowercase with unsafe characters replaced by `-`. If that directory exists, the slug gets a `-2`, `-3`, … suffix. The code lives in `worktree-isolation.ts`; it does not depend on the `git-worktrees` extension.

The worktree's branch depends on `branch`:

| `branch` | Worktree checks out | Starts at |
|---|---|---|
| an existing branch (or tag or commit) | a new branch named `<slug>` | the tip of `branch` |
| a name that does not exist | a new branch with that name | the main checkout's `HEAD` |
| omitted | a new branch named `<slug>` | the main checkout's `HEAD` |

For an existing `branch`, the subagent gets its own branch instead of checking out `branch` itself. Git refuses to check out one branch in two worktrees, so checking out `branch` would fail whenever it is checked out in the main checkout or another worktree. It would also let parallel subagents that start from the same base collide. With a new branch, `branch` is never moved, and the subagent's work is one reviewable branch per subagent that you merge or fast-forward into `branch`.

The extension creates branches with `git worktree add -b`, never `-B`, so an existing branch is never reset. If the branch it would create already exists, `subagent` fails with an error that names the branch; pick another `name` or `branch`. It writes no git config and no `_wt/` branches. It also writes `.pi/git-worktrees/.gitignore` (`*`) so the worktrees don't show in the main checkout's `git status`.

When the subagent closes, for any reason (`subagent_close`, the idle timeout, a `keepAlive: false` run that finished, or a crash), the extension releases the worktree. When the parent session ends, release is best effort: it runs only if the watcher's abort handler gets to run before the process exits. Release works like this:

- If `git status --porcelain --untracked-files=all` in the worktree is empty, it runs `git worktree remove <path>` (without `--force`) from the main checkout.
- If the worktree has uncommitted or untracked files, it keeps the worktree, because subagents leave their work uncommitted for review. The report reads `Kept worktree <path> (branch "<branch>") because it is dirty: 3 uncommitted or untracked files; commit or move them, then remove it with git worktree remove <path>`.
- If git refuses the removal (for example, the worktree is locked), it keeps the worktree and reports git's message.
- It never deletes a branch. The branch is the deliverable.

The report goes where the orchestrator sees it: in the `subagent_close` result (and `details.worktree`), in the idle-close or exit notice, or after the result of a run that ended. Removal errors never stop the window from closing.

Resuming a closed worktree subagent with `subagent_message` recreates a removed worktree at the same path on its kept branch, as-is.

### Container isolation

`isolation: "container"` lets a subagent inspect a repository, package, or website that might be malicious without giving it access to your machine. It needs Docker Desktop running. Use the `audit` profile:

```ts
subagent({
  profile: "audit",
  isolation: "container",
  source: "https://github.com/owner/repo", // or a local folder path
  network: "offline",                     // or "web"
  task: "Check this repo for malicious install hooks or credential theft.",
})
```

The child pi process still runs on the host, because it holds the API key and talks to the model. It never gets a host tool. Its only tools are `sandbox_bash`, `sandbox_read`, and `sandbox_ls`, which run through `docker exec` in a container as user 10001. The launch also turns off built-in tools, MCP, AGENTS.md files, skills, prompt templates, and `ask_question`, and runs the child in an empty directory. The tools have their own names, so if their extension fails to load the child has no tools at all; it does not fall back to host `bash` or `read`.

`source` is copied into `/work` before the child starts:

- An `https://` git URL without credentials is cloned with `--depth 1 --no-recurse-submodules` in a separate, hardened, throwaway container that has network access. The clone is streamed into the sandbox as a tar, so the sandbox itself stays offline. A fresh clone has no hooks to run.
- A local folder is archived on the host with `tar`, which stores symlinks as links instead of following them, and unpacked into `/work/<folder-name>`. `/` and any folder that contains your home folder are refused, so SSH keys and tokens can't end up in a web-mode sandbox.
- Omitted, `/work` is empty, for example to inspect a website.

The container (`container-isolation.ts`, image built from `container/Dockerfile` on a digest-pinned Debian base) runs with:

- no capabilities, `no-new-privileges`, and a read-only root filesystem;
- size-limited tmpfs for `/tmp` and home, and an anonymous Docker volume for `/work` that is removed with the container;
- limits of 256 processes, 2 GB memory, and 2 CPUs;
- no host mounts, no Docker socket, and no host environment;
- a 4-hour lifetime as a backstop if pi crashes.

`network` picks the network:

| `network` | What the child can reach |
|---|---|
| `offline` (default) | Nothing. The container has no network interface besides loopback. |
| `web` | HTTP and HTTPS on ports 80 and 443 to public addresses, through a proxy container on a per-sandbox internal network. The proxy resolves each name and refuses private, loopback, link-local, CGNAT, and cloud-metadata addresses, so the child cannot reach your Mac, your LAN, or Docker's VM. DNS from the sandbox itself fails. The child gets `web-fetch`, `web-search` (DuckDuckGo), and `web-shot` (Chromium screenshots that `sandbox_read` returns as images). |

Web mode trades containment for reach: a child hijacked by the content it reads could send what it read to a public host. Use it only when the task needs the internet.

Output from the sandbox is untrusted. The tools replace terminal control characters, bidi overrides, and zero-width characters with `<U+XXXX>` markers before the model or your terminal sees them. That stops terminal escape tricks and makes Trojan Source visible as a finding.

The container, the proxy, and the network are removed when the subagent closes, for any reason, and when the parent pi session shuts down. Removal runs in a detached process, so closing never waits on Docker. Resuming a closed container subagent with `subagent_message` creates a fresh sandbox with the same `source` and `network`; files the child made earlier are gone, and its follow-up message says so.

The extension refuses a container spawn that would weaken the isolation: a `fork` or `lineage-only` session mode (the child would inherit this conversation), a `cli: claude` profile (Claude Code brings its own host tools), and `branch` or `cwd`. It also refuses to run the `audit` profile, or any profile with `sandbox_*` tools, without `isolation: "container"`.

What this does not protect against: a Docker or kernel escape, and a malicious model response that persuades you, the person reading the report. The report is input to your judgment, not a verdict.

This extension never commits, merges, or pushes.

## Lifecycle: the orchestrator closes subagents

Autonomous subagents stay open after they finish. When a turn ends, the child parks instead of exiting and writes a `<session>.turn` signal. The parent delivers that turn's result as a steer message and leaves the tmux window running.

- `subagent_message({ name, message })` sends follow-up work into the same live session. Its next result arrives the same way.
- `subagent_close({ name })` ends the process and the window once you have accepted the result. It refuses while the subagent is mid-turn unless you pass `force: true`.
- Closed subagents keep their session file, so `subagent_message` with the same name resumes them later.

Safety nets: a parked subagent closes itself after `keepAlive.idleCloseMinutes` (default 30, `0` disables), and every subagent closes when the parent session exits.

For a one-shot run that closes itself when done, pass `keepAlive: false` to `subagent`. Set `keepAlive.enabled: false` in `config.json` to make one-shot the default. Interactive profiles (no `auto-exit`) and `cli: claude` profiles are unaffected.

```json
{
  "status": { "enabled": true },
  "keepAlive": { "enabled": true, "idleCloseMinutes": 30 }
}
```

Copy `config.json.example` to `config.json` to change these values.

## Tools

- `subagent`
- `subagent_message`
- `subagent_close`
- `subagents_list`
- `subagent_attach`

The upstream completion widget, named resume, sandbox loadout, and `ask_question` flow are retained. Children launch with `--no-extensions` and explicit tool allowlists.

## License

See `LICENSE` and `NOTICE`. Substantial upstream code remains covered by its MIT notice.
