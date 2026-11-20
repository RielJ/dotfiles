# Modern Web Guidance (MWG) evaluation for Pi

**Verdict: use only the search CLI, called from the `design` skill. Don't install the SKILL.md.**
- The skill's own text is the problem for your setup (see §5).
- The guides themselves are good and mostly additive (see §4).
- It must be run with `DISABLE_TELEMETRY=1` (see §2).

Method: unpkg.com (npm package 1.0.1), raw.githubusercontent.com, GitHub API, developer.chrome.com, and a local read of your `design` and `web-perf` skills.

## 1. Inventory

The distribution repo has two skills (GitHub API `GoogleChrome/modern-web-guidance/contents/skills`):
- `chrome-extensions` is a self-contained MV3 skill (26 KB). It is irrelevant to you. Its description triggers on "Chrome extension", `manifest.json`, "popup", "side panel" and similar (raw `skills/chrome-extensions/SKILL.md`).
- `modern-web-guidance` is the real product. Its SKILL.md is 9.8 KB (about 2.5k tokens), and it does not inline any guides.

The guides are fetched at runtime by a CLI (`skills/modern-web-guidance/SKILL.md`, Step 1–2):
- `npx -y modern-web-guidance@latest search "<2–5 word query>" --skill-version <ver>` returns `[{id, description}]`.
- `npx -y modern-web-guidance@latest retrieve "<id>[,<id>]"` returns the guide(s).
- Retrieved output over 9.5 KB is saved to `/tmp/mwg-guide-<pid>-<ts>.md` and the agent is told to read that file (CLI source, `MAX_INLINE_STDOUT_BYTES = 9500`).

Package contents (app.unpkg.com listing of 1.0.1):

| Path | Size |
|---|---|
| `skills/modern-web-guidance/gen/` (search index and vectors) | 9.19 MB |
| `guides/` | 2.02 MB |
| `legacy-scan.mjs` | 5.12 MB |
| `modern-web.mjs` (CLI) | 43 KB |
| `search.mjs` | 6.9 KB |
| SKILL.md | 9.8 KB |

Guide topics:
- The docs index (developer.chrome.com/docs/modern-web-guidance/guides) lists roughly 200 guides. The docs say "203 use cases"; the search page says a "192-guide corpus"; my own tally was about 210. The counts disagree.
- Categories: Visual Design, UI Atoms, UI Components, UI Behaviors (about 40, the largest), User Experience, Forms, HTML, CSS, JavaScript (Temporal), WebAssembly, Performance (about 27), Accessibility, Security (about 18), Privacy, PWA, Built-in AI, WebMCP.
- Each category has a discipline hub guide: `html`, `css`, `forms`, `accessibility`, `performance`, `security`, `color`, `typography`, `motion`, `responsive-design`.
- Guide size is 1–7k tokens. Examples from the docs: `light-dismiss-a-dialog` is 1,085 tokens, `animate-to-from-top-layer` 1,541, `html` 5,484, `accessibility` 7,129 (docs get-started page sample output).
- Guides are vanilla HTML/CSS/JS. SKILL.md "Guidelines" has a short framework-adaptation section (cast new attributes, SSR guards, `useId()`, polyfills via client-side `import()`).

How it triggers (SKILL.md frontmatter lines 2–6):
- The description is about 1,000 characters (about 250 tokens, my estimate). It says "MANDATORY: Execute FIRST for all HTML/CSS and clientside JS tasks. Do NOT skip".
- It lists triggers: modals, dialogs, popovers, tables, dark mode, anchor positioning, container queries, view transitions, scroll-driven animations, forms, accessibility, scrollbars, CWV (LCP, INP, CLS), content-visibility, fetch priority, images, security, passkeys, web components, dates and timezones, built-in AI and more.
- It lists exclusions: backend, infra, tooling, Vite, tsconfig, ESLint, tests, copy changes.
- A third-party article (aibacon.net) quotes about 205 tokens for the always-loaded part. That is a secondary source.

## 2. Install, runtime and telemetry (from package source)

- **No install scripts.** `package.json` 1.0.1 (unpkg) has no `scripts` key and no dependencies. It has a `bin` entry pointing at `skills/modern-web-guidance/modern-web.mjs`. It requires Node >= 22.
- **What `install` does** (`modern-web.mjs`, `command === "install"`):
  - It does not write files itself.
  - It spawns `npx -y skills add GoogleChrome/modern-web-guidance --skill modern-web-guidance` (Vercel's `skills` CLI). `--choose` drops the `--skill` filter.
  - It sets `AI_AGENT=<detected agent>` in the child's environment.
  - `update` and `uninstall` also shell out to `npx -y skills update|remove`.
  - Vercel's `skills` CLI does the actual writing, and I did not audit it.
- **Pi is known.**
  - The CLI's agent detection includes `PI` (`PI_CODING_AGENT` env, or `.pi/agent` in PATH) in `KNOWN_AGENTS` and `AGENT_RULES`.
  - Vercel's `docs/agents.md` maps Pi to `.agents/skills/` (project) and `~/.agents/skills/` (global). That is where your Cloudflare skills already live.
  - It is not installed into `~/.pi/agent/skills`.
- **`search`, `list` and `retrieve` run locally.**
  - `search.mjs` uses BM25 plus a bundled 256-dimension static embedding matrix and an int8 vector index in `gen/`. It makes no network calls.
  - The only network cost is `npx` resolving `@latest` on each invocation.
  - Optional: `ENABLE_FILE_LOGGING=true` appends `modern-web.log` in the current directory. It is off by default.
- **Telemetry is on by default.**
  - Each command spawns a detached watchdog (`watchdog/main.js`) that POSTs to `https://play.googleapis.com/log?format=json_proto` (log source 2921).
  - The payload includes the raw search query text, result guide ids with similarity, retrieved guide id, OS, CLI version, skill version, detected agent name, bucketed latency and success.
  - Opt out with `DISABLE_TELEMETRY=1` or `true`. That is the only check I found in `isTelemetryEnabled()`.
  - Your queries are generic capability phrases per the skill rules. For example, a query reading "rolecraft pricing modal" would still leave your machine, so keep queries generic.
- **Config files.**
  - `set-baseline` writes `.mwgrc` (JSON) at the git root or the nearest `.mwgrc`, falling back to `~/.mwgrc`. Fallback strictness (`widely`, `newly`, `limited` or a year) is read from it.
  - Guides tied to origin trials or single-engine features are blocked until a human runs `set-allow-origin-trials` or `set-allow-volatile-features`. These refuse to run if an agent environment is detected.
- **Stderr nag.** If the skill version is stale, the CLI prints "PROBLEM DETECTED… insist that the user upgrade" to the agent's stderr. It is benign, but it is text injected into the agent's context.
- **Supply chain.** `npx -y ...@latest` pulls whatever is newest on every call. Pin `modern-web-guidance@1.0.1` if you adopt it.

Search queries: not run. Documented output for "animate a dialog modal backdrop" (get-started page) returns `light-dismiss-a-dialog` (0.71), `animate-to-from-top-layer` (0.68), `declarative-dialog-popover-control`, `html`, `accessibility`.

For your other topics, the likely guides are (inferred from the docs guide index, not executed):
- View transitions: `same-document-transitions`, `scoped-component-transitions`, `cross-document-transitions`, `directional-navigation-transitions`.
- Container queries: `size-aware-styling`, `card`, `responsive-design`.

## 3. Evals

Source: the dashboard (googlechrome.github.io/modern-web-guidance-src/, "How we test" text) and the v1 blog post (developer.chrome.com/blog/modern-web-guidance-v1).

- **Design.**
  - Nightly and baseline A/B jobs run the same task twice per agent and model, with and without MWG installed as a skill.
  - Each task is a starter app plus a feature prompt that never mentions MWG.
  - Playwright checks the DOM, computed styles, source and a11y behavior.
  - Pass rate is checks passed over checks run, and lift is in percentage points.
  - The dashboard also reports automated a11y checks, median task duration, and uncached tokens. It says explicitly that these a11y checks are not a WCAG audit.
- **Agents tested:** Claude Code, Codex CLI, Antigravity CLI. Pi was not tested.
- **Reported gains.**
  - The docs landing page says unguided frontier models score about 51% and MWG scores 91%.
  - The aibacon summary of the launch says 55% to 92%, about 200 tasks and 1,700 assertions, and per-model gains of +28 to +36 points. This is secondary and conflicts with the docs 51/91 figure.
  - The dashboard numbers load via JavaScript and I could not read them. Use the live page.
- **How much to trust it.**
  - The harness is open source, and the grader FAQ says graders assert behavior rather than guide-specific markup. This is a strength.
  - The aibacon summary says graders are calibrated: golden solutions must pass 100% and the unmodified base app must fail 100%. That is secondary and I did not verify it in the repo.
  - The dashboard admits graders have rejected valid alternative implementations and that it re-scores jobs afterwards. That suggests some bias toward guide-shaped answers.
  - The tasks and graders come from the guide authors' own topics (CONTRIBUTING guide-authoring track: `guide.md`, `demo.html`, `expectations.md`). This is my inference: the tasks measure whether the agent followed the guides' preferred features, not whether the product is better.
  - "Without MWG" is a bare model with no design skill. The benchmark does not compare MWG against your existing `design` skill or any similar skill.
  - Case studies on the docs page (Note, MetaMask, Policybazaar and others) are vendor-published.
  - Search quality has its own public benchmark (95.4% Hit@10 on held-out queries, 99.4% on agent queries, cold search 240 ms). That is the part most relevant to using the CLI alone. It is also vendor-run, and the relevance grading was done by an LLM (`gemini-3.8-flash`), calibrated against 69 human ratings.

Bottom line: the gains are plausible for feature adoption such as `<dialog>` and `@starting-style`. They are not evidence for your stack or workflow.

## 4. Overlap with your `design` and `web-perf` skills

**Already covered by `design`:**
- `@starting-style`, `transition-behavior: allow-discrete` and `overlay` for popover/dialog entry and exit (`references/enter-exit.md:75-101`, `animation-recipes.md`, `components.md:74`).
- `prefers-reduced-motion` (`SKILL.md:129`) and `text-wrap: balance` (`web-interface-guidelines.md:64`).
- OKLCH, dark mode and contrast (`color.md`).
- Container queries, only one line (`layout.md:33`).
- Focus management in dialogs (`harden.md:60`), and `overscroll-behavior: contain` in overlays (`polish.md:15`).
- Taste-level guidance: easing values, durations, a frequency gate, anti-AI-slop rules. MWG has none of this.

**New in MWG (not in `design` or `web-perf`):**
- View Transitions, including scoped, directional and cross-document.
- Scroll-driven animations, and anchor positioning (tooltips, dropdowns, sliding tab underline).
- Invoker commands, interest-triggered previews, customizable `<select>`, `field-sizing`, `:user-invalid` validation timing, autofill and IME-safe forms.
- Many UI patterns (accordion, nav drawer, toasts, swipe gestures).
- Temporal, passkeys, Trusted Types, CSP, HTML sanitization.
- Performance: `scheduler.yield`, long-task splitting, fetch priority and LCP image priority, speculation rules and prerender, `content-visibility`.
- Baseline-aware fallbacks via `.mwgrc`.

**`web-perf` relation.** Your skill is an audit workflow driven by Chrome DevTools MCP. MWG's perf guides give fix patterns such as `break-up-long-tasks`, `identify-inp-causes`, `optimize-image-priority`, `schedule-tasks-by-priority` and `improve-next-page-load-performance`. They are complementary: web-perf finds issues and MWG supplies fixes.

**Contradictions and conflicts:**
1. **Triggering.**
   - SKILL.md says "MANDATORY: Execute FIRST for all HTML/CSS and clientside JS tasks" (lines 3–5). Your `design` skill starts from restraint ("don't animate this" is valid, `design/SKILL.md:9`) and has a router.
   - Installing both makes them compete on every UI request.
2. **Output format.**
   - SKILL.md Step 4 requires ending the response with a `### Modern Web Guidance` section.
   - Your global AGENTS.md requires ending with `Blocked on me / Changed / Found`, and your `unslop` skill must always apply. These collide.
3. **Keyboard-initiated animation.**
   - `design` says "Never animate keyboard-initiated actions" (`SKILL.md:~107`).
   - The `animate-to-from-top-layer` guide intercepts the `cancel` event (Esc) so the close is animated.
4. **Timing.**
   - The guide uses symmetric `0.3s` enter and exit with plain `ease-out`.
   - `design` says exits are faster than entrances (150 ms), the UI maximum is 300 ms, and it uses a custom `--ease-out` cubic-bezier (`SKILL.md:~97-111`).
5. **Component libraries.**
   - `design` assumes Radix and Base UI hooks (`data-starting-style`, `--radix-popover-content-transform-origin`).
   - MWG guides are vanilla `<dialog>` and `popover`.
   - The `same-document-transitions` guide does raw DOM class toggling around `document.startViewTransition`. That does not fit React state.
   - I did not verify how the SKILL.md framework notes handle Next.js, for example React's `<ViewTransition>`. This is the main risk for rolecraft-ai.
6. **Agreement (not contradictions).**
   - Reduced motion: MWG says do not globally set `animation-duration: 0.01ms`, keep non-spatial transitions, and drop spatial motion. `design` says gentler, not none, with an opacity cross-fade.
   - Scale-in start: both use `scale(0.9)`.
   - `overlay` is flagged as limited support in both.

## 5. Recommendation: use only the search CLI from `design` (and `web-perf`)

Why not install:
- A new skill costs about 250 tokens of description in every session.
- Its description is built to fire on nearly every web UI task. Each firing then loads the 2.5k-token SKILL.md, makes a network `npx` call, and pulls guides of 1–7k tokens.
- It forces the disclosure footer and the mandatory-first workflow, which conflict with your AGENTS.md and `design`'s restraint rule.
- Telemetry is on by default.

Why the CLI route works: it costs nothing per session. The lines load only when `design` is already in use.

**Exact lines to add to `~/.pi/agent/skills/design/SKILL.md`.**

Add one row to the "Hand off" table (after line 55; line numbers approximate):

```
| Choosing a native web platform feature (view transitions, anchor positioning, popover/dialog, scroll-driven animation, container queries, Temporal, passkeys, CSP) or checking Baseline fallbacks | Look it up with the MWG search CLI below, then adapt it to the project's component library |
```

Add a section before "House values":

```
## Platform feature lookup (optional)

Before hand-rolling JS for dialogs, popovers, tooltips, transitions, scroll effects, forms or dates, check for a native feature. Use 2-5 word generic queries with no project or framework names:

    DISABLE_TELEMETRY=1 npx -y modern-web-guidance@1.0.1 search "<capability>"
    DISABLE_TELEMETRY=1 npx -y modern-web-guidance@1.0.1 retrieve "<id>"

Retrieve only guides whose description matches. If the project uses Radix, Base UI or shadcn, keep that component and take only the CSS or API idea. Where a guide conflicts with the rules in this skill (keyboard-initiated actions, duration, easing), this skill wins. Do not add a "Modern Web Guidance" section to replies. Needs Node 22 or later. Skip it for pure framework work.
```

For `~/.agents/skills/web-perf/SKILL.md`, optionally add one line under Retrieval Sources: guides `break-up-long-tasks`, `identify-inp-causes`, `optimize-image-priority`, `schedule-tasks-by-priority`, `improve-next-page-load-performance`, fetched via the same search command. That file sits in `~/.agents/skills`, which may be overwritten by a skills manager, so check that before editing.

**If you decide to install anyway.**
- Command: `npx skills add GoogleChrome/modern-web-guidance --skill modern-web-guidance -g -a pi` (flags per the vercel-labs/skills README; I did not run it).
- Then edit the installed SKILL.md: remove "MANDATORY… FIRST", remove Step 4, and set `DISABLE_TELEMETRY=1`.
- That would make it a local fork, so you lose the auto-update.

## 6. Could not confirm

- No shallow clones or `npm pack` into `/tmp/mwg-eval`, so no local line or token counts. The sizes above come from unpkg and GitHub listings.
- No `npx ... search` runs, so the three stack queries are inferred from the guide index.
- The dashboard's live numbers (JS-rendered) and the MWG-vs-no-MWG task list were not read. The 51/91 and 55/92 figures are unreconciled.
- I did not audit Vercel's `skills` CLI: its writes, its telemetry, or whether it records anything about Pi-specific paths.
- I did not read `legacy-scan.mjs` (5 MB). SKILL.md says it is a static scan covering about 20% of the guides and is not needed for your use.
- I did not read the SKILL.md framework notes against Next.js App Router or React 19 view transitions.
- `docs/EVALS.md` and `GOVERNANCE.md` in the src repo were not read.

## Orchestrator verification (2026-11-18)

Checked with `npm pack modern-web-guidance@1.0.1`: `package.json` has no `scripts` and no `dependencies`; `isTelemetryEnabled()` reads `DISABLE_TELEMETRY` (`skills/modern-web-guidance/modern-web.mjs:711`); the watchdog posts to `https://play.googleapis.com/log?format=json_proto` (`watchdog/main.js:13`). The evaluating subagent had no shell, so the search queries in section 2 remain unrun.
