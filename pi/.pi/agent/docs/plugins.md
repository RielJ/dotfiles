# Plugin Registry

A running record of pi extensions and agent skills: what is installed, what has been evaluated and rejected, and what is worth looking at later. The goal is to avoid re-litigating the same decision every time something trends on GitHub.

Last updated: 2026-07-29

---

## Evaluation checklist

Before installing anything that executes in a pi session, work through these. Most of them take a couple of minutes with a shallow clone into `/tmp`.

**1. What actually executes?**
A skill is inert markdown and carries no runtime risk. An extension runs code in your session. Establish which one you are dealing with before anything else.

```bash
git clone --depth 1 <repo> /tmp/<name> && cd /tmp/<name>
grep -rnE "fetch\(|child_process|execSync|spawnSync|eval\(|new Function" --include="*.js" .
```

**2. What is shipped versus what is in the repo?**
Maintainer scripts frequently contain `spawnSync` and similar, and are usually excluded from the published package. Check the `files` array in `package.json` rather than assuming the repo contents are what you install.

**3. What does it write, and where?**
Config and state under `~/.config/<name>` is normal. Writes into project directories, or into other tools' configuration, deserve scrutiny.

**4. What does it cost per turn?**
Anything hooking `before_agent_start` and appending to the system prompt is billed on every single turn. Measure it rather than guessing:

```bash
node -e "const {getInstructions}=require('./hooks/...'); console.log(getInstructions('full').length)"
```

Roughly 3.7 characters per token is a serviceable estimate.

**5. Does it conflict with something already loaded?**
Two extensions injecting persistent behavioural directives into the system prompt will fight each other. This is the most common practical problem and it is invisible until output quality degrades.

**6. Is the maintenance profile acceptable?**
Star count is close to meaningless, especially for anything under a few months old. Look at commit recency, open issue count, whether the author responds to substantive criticism, and whether there is a single maintainer.

---

## Installed

### npm packages

Declared in `settings.json` under `packages`.

| Package | Purpose |
|---|---|
| `pi-lens` | LSP diagnostics, ast-grep, code intelligence |
| `@ff-labs/pi-fff` | Fast frecency-ranked file and content search |
| `pi-mcp-adapter` | MCP server bridge |
| `@sting8k/pi-vcc` | Session recall across compaction |
| `@tintinweb/pi-tasks` | Task list and subagent execution |
| `@llblab/pi-telegram` | Telegram bridge — remote approval surface |
| `pi-agent-browser-native` | Browser automation |
| `@bytesbrains/pi-textbrowser` | Headless browser, DOM plus OCR text maps |
| `@ayulab/pi-rewind` | Session rewind |
| `pi-vim` | Vim keybindings |
| `@juicesharp/rpiv-ask-user-question` | Structured user questions |
| `@tomooshi/condensed-milk-pi` | Tool-result masking for prompt cache stability |
| `@tomooshi/caveman-milk-pi` | Terse response style enforcement |
| `pi-token-burden` | Token usage tracking |
| `pi-promptsmith` | Prompt tooling |
| `pi-skills-sh`, `pi-skill-toggle` | Skill management |
| `pi-bash-bg` | Background bash jobs |
| `pi-tool-display` | Tool output rendering |
| `@ogulcancelik/pi-minimal-footer` | Footer UI |
| `@tmustier/pi-tab-status` | Tab status |

Note that `@bytesbrains/pi-textbrowser` was previously `pi-textbrowser`, which was unpublished from npm on 2026-07-21. Because npm installs atomically, the dead name blocked every other extension update until the rename was applied. Worth remembering as a failure mode: one unpublished package silently freezes the whole update batch.

### Local extensions

Under `extensions/`, not installed from npm.

| Extension | Purpose |
|---|---|
| `superpowers` | Multi-model planner and reviewer, plan executor, QMD search, web search |
| `git-worktrees` | Worktree provisioning, detached agents, heartbeat, status widget, tmux attach |
| `adw` | AI Developer Workflows (in progress) |
| `pi-tool-display` | Local tool display overrides |
| `git-workflow.ts` | Git helpers |
| `session-utils.ts`, `shortcuts.ts`, `pi-notify.ts` | Session utilities |
| `image-media-type-guard.ts` | Image handling guard |

---

## Evaluated

### herdr — *adapter only, not adopted as foundation*

<https://herdr.dev> · <https://github.com/ogulcancelik/herdr>

An agent multiplexer: a Rust binary providing a real PTY per agent, persistent sessions surviving terminal closure, SSH and mobile attach, semantic agent state, and a CLI plus JSON socket API. Pi is a supported integration.

It is a presentation and process-supervision layer, not an orchestration engine. It has no workflow graph, no sandbox provisioning, no run-state persistence, and no structured output — `pane read` returns scraped terminal text, which must never be used for control-flow decisions.

Roughly sixty percent of what it offers is already covered by the local `git-worktrees` extension, which provides worktree isolation, heartbeat monitoring, a status widget, and tmux popups for attaching to a running agent. What herdr adds over that is genuine but narrow: sessions that survive the laptop closing, and mobile attach.

Reasonable as an optional adapter for agent supervision and human gates in `pi-adw`. Not a foundation, and never a hard dependency — it is a new project with a single maintainer distributed by `curl | sh`.

### ponytail — *skills worth lifting, extension not installed*

<https://github.com/DietrichGebert/ponytail> · MIT · ~96.5k stars, created 2026-06-12

A prompt that enforces a decision ladder before code is written: does this need to exist at all, is it already in the codebase, does the standard library cover it, is there a native platform feature, is an installed dependency sufficient, can it be one line, and only then the minimum that works.

The ladder is sound, and three details show real care. It runs *after* comprehension rather than instead of it. Safety concerns — trust-boundary validation, data-loss handling, security, accessibility — are explicitly never cut. And deliberate corner-cuts are marked in code with a `ponytail:` comment naming both the ceiling and the upgrade path.

A source audit came back clean: no network calls in runtime code, no `eval`, and the only `spawnSync` lives in a maintainer publish script that is not shipped. Filesystem writes are confined to configuration and state directories.

The extension was still not installed, for two reasons. It injects roughly 1,400 tokens into the system prompt on every turn via `before_agent_start`. And that injection collides directly with `caveman-milk-pi`, which occupies the same layer and issues its own persistence directives. Two always-on style enforcers is a bad configuration regardless of the merits of either.

The benchmarks are directionally interesting but weak evidence: n=4 across 12 tasks, Haiku 4.5 only for the agentic run, LOC from `git diff` as the primary metric, and self-authored throughout. The authors do acknowledge that results reverse on GPT-class reasoning models, and they publicly revised their headline figure down from 80–94% to roughly 54% after criticism — which is more honesty than most benchmark pages offer.

The useful outcome is per-node adoption in `pi-adw`, where nodes do not inherit the interactive system prompt and the conflict therefore disappears:

```ts
build:  { kind: "agent", skills: ["ponytail"],        … }
review: { kind: "agent", skills: ["ponytail-review"], … }
```

Independently of adoption, the `ponytail:` comment convention and the `ponytail-debt` ledger that harvests those comments are worth stealing outright. A build agent that self-declares its shortcuts, each with a stated ceiling and upgrade path, hands the review node exactly the input it needs.

---

## Candidates

Not yet evaluated. Add entries here rather than acting on them immediately.

| Candidate | Why it might matter | Status |
|---|---|---|
| *(empty)* | | |

---

## Rejected

Nothing has been evaluated and rejected outright so far. Both entries above were partially adopted.

---

## Recurring lessons

**Prompt-only projects rarely justify a dependency.** If the value is a markdown file, copy it into a skill you own. You get contextual activation instead of always-on injection, no hook to fail, no conflict with existing extensions, and freedom to tune it per node.

**Always-on system-prompt injection is the expensive default.** It is billed every turn and it composes badly. Contextual skill activation is almost always the better mechanism for the same content.

**Star velocity is not quality.** Ninety thousand stars in six weeks describes a hype cycle. Judge the source, the maintenance profile, and the measured cost instead.

**Check for layer collisions before installing.** The question is not whether a plugin is good in isolation, but whether it fights something already loaded.
