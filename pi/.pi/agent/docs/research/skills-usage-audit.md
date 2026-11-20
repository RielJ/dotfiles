# Skills usage audit (2026-11-17)

**Result:** Pi puts 60 skills into the system prompt. Their entries cost about **7,600 tokens** in every session started in this repo, and about **6,460 tokens** in other directories. Most of that cost comes from skills that the logs show no use of. If the user adopts every recommendation below, sessions outside this repo drop to about **2,300 tokens**, a saving of about **4,160 tokens (64%)**. Sessions in this repo save another 397 tokens. Only the 6 hidden skills cost nothing.

## 1. Method and caveats

**Skill sources loaded** (checked against Pi docs `docs/skills.md` and `docs/settings.md`, `settings.json` `packages`, and this session's `<available_skills>` list):

| Source | Path | Skills (visible + hidden) |
|---|---|---|
| user | `~/.pi/agent/skills` → `~/dotfiles/pi/.pi/agent/skills` (git-tracked) | 22 + 6 hidden |
| project | `~/dotfiles/pi/.pi/agent/.pi/skills` (loads only when cwd is this repo; **git-ignored** by `.gitignore:28 .pi`) | 6 |
| Agent Skills | `~/.agents/skills` (installed by `npx skills`; `~/.agents/.skill-lock.json`) | 23 |
| package | `pi-lens/skills`, `@llblab/pi-telegram/dist/skills`, `pi-btw/skills` (from each `package.json` `pi.skills`) | 4 + 4 + 1 |
| not loaded | `extensions/adw/skills` (6; adw-only, not in the prompt). `@tomooshi/caveman-milk-pi/skill` is not declared in the package manifest. `settings.json` has no top-level `skills` key. | 0 |

**Usage evidence.** `/tmp/skill_audit/scan2.py` streams 461 `.jsonl` files line by line (sessions dated 2026-08-16 to 2026-11-17). It counts:
- (a) `read` tool calls whose path ends in `<skill>/SKILL.md`, bash `cat/sed/head` calls on a SKILL.md, and reads of files under `skills/<name>/` (references).
- (b) `/skill:` invocations. Pi stores these as expanded `<skill name=… location=…>` user messages (`agent-session.js:1823`).
- (c) `subagent` tool calls with `skills: [...]`, plus the `<skill name=… scope=…>` blocks injected into the child sessions.
- (d) A static `rg` for skill names in `extensions/`, `agents/`, `AGENTS.md` and the other skills (results in §3).

**Cost.** `/tmp/skill_audit/sizes.mjs` parses each frontmatter with Pi's own `yaml` package and rebuilds the exact `<skill><name><description><location>` entry that `formatSkillsForPrompt` (`core/skills.js:278`) emits. Skills with `disable-model-invocation: true` are filtered out of that list. Tokens are estimated as chars/4.

**Caveats:**
- "Field" use means use outside sessions whose cwd is `~/dotfiles/pi/.pi/agent`. Sessions in that cwd are mostly skill authoring and audits. For example, `2026-10-08T23-45-30-962Z_b45cd407…` read 69 skills while surveying them. Slash and subagent uses always count as field use.
- Reads on 2026-11-17 at 20:58–21:00 (`extension-security-audit`, `web-perf`, `shell-safety`) come from sibling audit subagents of this orchestrator. They are not real use.
- The session store starts on 2026-08-16. Use of older skills (shadcn, vercel-react-best-practices, code-review-graph) before that date is not visible.
- The "created" date is the file birth time. For `~/.agents`, it is the `installedAt` value in the lock file. Git `--diff-filter=A` returns 10-23 for most user skills because of a re-add commit, so I did not use it.
- Many reads come from `grill-me`, because it tells the model to read `../grilling/SKILL.md`. Reads of `unslop` happen on nearly every writing turn because its description says "Must always apply".

## 2. Usage table

Column meanings:
- reads = all reads / field reads.
- slash = `/skill:` invocations.
- subagent = parent calls passing `skills` (child sessions that received the skill).
- sessions = all / field. Child session files are excluded.
- tok = estimated prompt tokens. "hidden" means explicit-only and costs 0.

| skill | source | created | reads | slash | subagent | sessions | last used | tok |
|---|---|---|---|---|---|---|---|---|
| typescript-best-practices | user | 10-09 | 66/62 | 0 | 49 (44) | 59/57 | 11-17 | 139 |
| unslop | user | 08-27 | 129/104 | 2 | 10 (8) | 74/64 | 11-16 | 49 |
| tdd | user | 10-09 | 44/39 | 0 | 29 (29) | 37/35 | 11-12 | 121 |
| technical-writing | user | 10-09 | 32/26 | 0 | 18 (16) | 20/17 | 11-12 | 144 |
| design | user | 10-18 | 42/39 | 6 | 14 (11) | 18/16 | 11-16 | 232 |
| principles | user | 10-09 | 29/28 | 0 | 2 (1) | 17/16 | 11-09 | 184 |
| vercel-react-best-practices | user | 03-30 | 18/17 | 0 | 2 (2) | 16/15 | 11-10 | 130 |
| improve-codebase-architecture | user | 08-17 | 18/17 | 11 | 0 | 14/13 | 11-17 | hidden |
| grill-me | user | 08-17 | 10/8 | 18 | 0 | 13/12 | 10-20 | hidden |
| shadcn | user | 03-24 | 11/10 | 0 | 0 | 10/9 | 11-16 | 140 |
| teach | user | 08-18 | 16/9 | 11 | 0 | 8/5 | 10-29 | hidden |
| code-review-graph | user | 04-20 | 9/7 | 0 | 0 | 8/6 | 11-05 | 121 |
| systematic-debugging | user | 10-19 | 8/7 | 0 | 0 | 6/5 | 11-13 | 160 |
| show-me-your-work | user | 10-09 | 20/15 | 0 | 0 | 6/4 | 11-05 | 153 |
| grilling | user | 09-23 | 11/8 | 0 | 0 | 5/3 | 11-05 | 78 |
| benchmark-optimization-loop | user | 10-19 | 4/3 | 0 | 0 | 4/3 | 11-16 | 148 |
| mobile-native | user | 10-09 | 6/1 | 0 | 2 (2) | 4/2 | 11-04 | 221 |
| correct | user | 10-09 | 9/3 | 0 | 0 | 4/2 | 10-23 | 152 |
| click-path-audit | user | 10-19 | 3/2 | 0 | 0 | 2/1 | 10-23 | 172 |
| break-ui | user | 10-09 | 3/0 | 0 | 0 | 2/0 | 10-19 | 188 |
| blast-radius | user | 10-09 | 4/0 | 0 | 0 | 1/0 | 10-08 | 136 |
| validate-plan | user | 10-09 | 2/0 | 0 | 0 | 1/0 | 10-18 | 173 |
| interview | user | 10-17 | 1/0 | 0 | 0 | 1/0 | 10-17 | 125 |
| ste | user | 10-17 | 1/0 | 0 | 0 | 1/0 | 10-17 | 106 |
| handoff | user | 10-09 | 0 | 0 | 0 | 0 | — | 214 |
| review-animations / prototype / pick-ui-library | user | 10-09 | 3/0, 1/0, 1/0 | 0 | 0 | ≤2/0 | 10-17 | hidden |
| agent-evaluation, agent-recovery-testing, agent-tool-design, contract-testing | project | 11-04 | 0 | 0 | 0 | 0 | — | 190+192+180+191 |
| extension-security-audit / shell-safety | project | 11-04 | 1/0, 2/0 (audit-only) | 0 | 0 | 0 field | — | 213, 171 |
| job-application-agent | ~/.agents | 08-19 | 14/14 | 0 | 0 | 2/2 (both `web-portfollio`) | 11-17 | 141 |
| web-perf | ~/.agents | 11-16 | 1/0 (audit) | 0 | 0 | 0 field | — | 69 |
| 21 other Cloudflare skills (§4) | ~/.agents | 11-16 | 0 | 0 | 0 | 0 | — | 2,050 total |
| pi-lens-lsp-navigation | pkg pi-lens | ≤09-16 | 14/12 | 0 | 0 | 12/11 | 10-27 | 92 |
| pi-lens-ast-grep | pkg pi-lens | ≤09-16 | 1/0 | 0 | 0 | 1/0 | 09-23 | 78 |
| pi-lens-write-ast-grep-rule / -write-tree-sitter-rule | pkg pi-lens | ≤09-16 | 0 | 0 | 0 | 0 | — | 86, 93 |
| telegram-bridge / show-me | pkg pi-telegram | ≤09-22 | 2/1, 1/1 | 0 | 0 | 1 field each | 09-22 | 90, 127 |
| generated-control-surface / generative-apps | pkg pi-telegram | ≤09-22 | 1/0, 0 | 0 | 0 | 0 field | — | 106, 148 |
| btw | pkg pi-btw | ? | 0 | 0 | 0 | 0 | — | 96 |
| adw:grilling (others 0) | ext adw (not loaded) | ≤08-17 | 4/4 | 0 | 0 | 4/4 | 09-01 | 0 |

Totals: 60 visible entries, 30,387 chars, about 7,597 tokens, plus about 80 tokens of list header. The 6 project skills (1,136 tokens) load only in this repo, so other directories pay about 6,461 tokens.

The logs also reference retired skills that no source contains anymore: `design-engineering`, `better-ui`, `animate`, `web-design-guidelines`, `react-best-practices`, `rust-best-practices`, `tauri-v2` and others. `rust-best-practices` and `tauri-v2` were subagent-injected 37 and 7 times on 11-10..11-12. Check whether those come from project-local skills in those repos.

## 3. Duplicates and overlaps

- **grill-me / grilling / interview / adw:grilling.** `grill-me` is an 8-line hidden wrapper: "Read ../grilling/SKILL.md and follow it exactly". It is the entry point the user actually types (18 slash invocations in 11 sessions, 08-17..10-20). Most `grilling` reads (all 7 in `hanapbuhay`, 10-17..10-20) follow those invocations. `improve-codebase-architecture` and `interview` also reference `grilling`. `interview` (spec interview) overlaps with grilling and has 0 field use in 31 days. `adw:grilling` is a separate copy pinned by `extensions/adw/skills-lock.json` for adw only.
- **design hub and satellites.** `design/SKILL.md` routes to `break-ui`, `mobile-native`, `review-animations`, `prototype`, `pick-ui-library`, `shadcn` and `vercel-react-best-practices` (static `rg` hits). `break-ui` and `click-path-audit` reference each other. `design` (created 10-18) replaced `design-engineering`, `better-ui`, `animate` and `web-design-guidelines`; their last reads are 10-20. The hub gets heavy use. Most satellites have no field use. `web-design-guidelines` is still listed in `~/.agents/.skill-lock.json`, but its directory is gone, so the lock entry is stale.
- **ste vs technical-writing.** The `technical-writing` description already says "apply… STE instruction rules". The `ste` description says "For writing or reviewing a full document, use technical-writing instead". No file references `ste`.
- **blast-radius vs code-review-graph vs adw:code-review.** These are all change-impact or review skills. `code-review-graph` has 6 field sessions. `blast-radius` has 0; only `systematic-debugging`, `click-path-audit` and `extension-security-audit` reference it.
- **Cloudflare (22).**
  - CLIs: `cf-cli` vs `wrangler`. The `cf-cli` description covers "choosing between cf and Wrangler".
  - Workers: `workers-best-practices`, `workers-development`, `workers-profiling`.
  - Sandbox: three skills for one product (`sandbox-stable`, `sandbox-next`, `sandbox-migrate-to-next`).
  - Frameworks: `frameworks-on-cloudflare` vs `nextjs-on-cloudflare`.
  - Zero Trust: `cloudflare-one`, `cloudflare-one-migrations`, `gateway-workers`.
  - `cloudflare` is the router for all of them.
  - All were installed 11-16 and have no use yet (1 day old, so too early to judge).
- **show-me-your-work vs pi-telegram show-me.** The names are similar, but the purposes differ: a decision log vs Telegram explanations. Not a duplicate.
- **unslop.** Its description ("Must always apply") makes the model read the 83-line body in about 64 sessions. That is a body-read cost, not a description cost. Consider making it a rule in AGENTS.md.

## 4. Recommendations

| skill(s) | action | why |
|---|---|---|
| typescript-best-practices, unslop, tdd, vercel-react-best-practices, code-review-graph, grilling, grill-me, teach, improve-codebase-architecture, pi-lens-lsp-navigation, pi-lens-ast-grep, telegram-bridge, show-me | **keep** | Steady field or subagent use (hidden ones cost 0). |
| design, mobile-native, principles, show-me-your-work, systematic-debugging, correct, technical-writing, benchmark-optimization-loop, shadcn | **keep, trim description to ≤300 chars** | Used, but descriptions run 385–703 chars (saves about 438 tok; the `cloudflare` trim adds 41). Move trigger lists into the body. `correct` is referenced in AGENTS.md. |
| handoff, interview, validate-plan, blast-radius, break-ui, click-path-audit | **move out of always-loaded: set `disable-model-invocation: true`** | 0–1 field sessions in 29–39 days. They stay usable as `/skill:<name>` and through relative links from `design`, `systematic-debugging` and other skills. |
| ste | **merge into technical-writing** (as `references/ste.md`) | Overlaps the technical-writing description. 0 field use. |
| review-animations, prototype, pick-ui-library | keep hidden (0 tok); optionally fold review-animations into `design/references/motion-audit.md` | Zero cost, so there is no urgency. |
| 6 project skills (`.pi/skills`) | **keep project-local, trim to ≤300 chars, and track them in git** | They are only 13 days old and only cost tokens in this repo. They are untracked today, so one `git clean` or machine change loses them. |
| job-application-agent | **move to project-local** `~/personal/web-portfollio/.agents/skills/` | All 14 reads come from `web-portfollio` sessions. |
| pi-lens-write-ast-grep-rule, pi-lens-write-tree-sitter-rule | **exclude via package filter** | 0 use in about 2 months. |
| generative-apps, generated-control-surface | **exclude via package filter** | 0 field use. Telegram turns appear only on 09-22 and 10-16. No code in `pi-telegram/dist` references them. |
| btw | **exclude via package filter** (`skills: []`) | 0 reads. The `/btw` command comes from the extension, not the skill. |
| adw/skills | leave alone | Not in Pi's prompt; used by adw. |

**Cloudflare grouping.** There are 5 local Cloudflare projects with `wrangler.jsonc`: `ajaia-docs` (D1 + Durable Objects + Hono), `jersey-studio`, `metrics-agent` (D1), `pos-2`, and `~/personal/job-application-agent/telemetry-worker`.
- **Keep global (223 tok):** `cloudflare` (router; also diagnoses Cloudflare error pages on any site; trim to ≤300 chars) and `web-perf` (not Cloudflare-specific).
- **Cloudflare projects only (17, 1,614 tok):** `wrangler`, `cf-cli`, `workers-best-practices`, `workers-development`, `workers-profiling`, `durable-objects`, `agents-sdk`, `frameworks-on-cloudflare`, `nextjs-on-cloudflare`, `cloudflare-app-bootstrap`, `cloudflare-email-service`, `turnstile-spin`, `k2`, `basin`, `sandbox-stable`, `sandbox-next`, `sandbox-migrate-to-next`.
- **Park or remove (3, 282 tok):** `cloudflare-one`, `cloudflare-one-migrations`, `gateway-workers`. These are Zero Trust/SASE skills. No project uses Zero Trust.

## 5. Savings if adopted (sessions outside this repo)

| change | tokens saved |
|---|---|
| Cloudflare skills to project-only | 1,614 |
| Park Zero Trust skills | 282 |
| Hide 6 low-use user skills | 1,008 |
| Merge ste | 106 |
| Move job-application-agent | 141 |
| Package filters (pi-lens ×2, telegram ×2, btw) | 530 |
| Trim 10 descriptions to ≤300 chars | 479 |
| **Total** | **≈4,160 of 6,461 (64%)** |

Trimming the 6 project skills saves about 397 more tokens in this repo.

## 6. Commands to apply. NOT RUN. Review before use.

```bash
# --- NOT RUN ---
# A. Hide low-use user skills (they stay available as /skill:<name>)
cd ~/dotfiles/pi/.pi/agent
for s in handoff interview validate-plan blast-radius break-ui click-path-audit; do
  perl -0pi -e 's/\A---\n/---\ndisable-model-invocation: true\n/' "skills/$s/SKILL.md"
done

# B. Merge ste into technical-writing
mkdir -p skills/technical-writing/references
git mv skills/ste/SKILL.md skills/technical-writing/references/ste.md
cmp -s skills/ste/LICENSE skills/technical-writing/LICENSE && git rm skills/ste/LICENSE
# then add to skills/technical-writing/SKILL.md: "For sentence-level STE rules read references/ste.md."

# C. Track the project-local skills (currently ignored by .gitignore:28)
git add -f .pi/skills

# D. Cloudflare: project-only + park Zero Trust
mkdir -p ~/.agents/skills-cloudflare ~/.agents/skills-parked
cd ~/.agents/skills
mv agents-sdk basin cf-cli cloudflare-app-bootstrap cloudflare-email-service durable-objects \
   frameworks-on-cloudflare k2 nextjs-on-cloudflare sandbox-migrate-to-next sandbox-next \
   sandbox-stable turnstile-spin workers-best-practices workers-development workers-profiling \
   wrangler ~/.agents/skills-cloudflare/
mv cloudflare-one cloudflare-one-migrations gateway-workers ~/.agents/skills-parked/
for p in ~/personal/projects/{ajaia-docs,jersey-studio,metrics-agent,pos-2} ~/personal/job-application-agent; do
  mkdir -p "$p/.pi"
  [ -e "$p/.pi/settings.json" ] || printf '{\n  "skills": ["~/.agents/skills-cloudflare"]\n}\n' > "$p/.pi/settings.json"
done   # none of the 5 has .pi/settings.json today (checked)

# E. job-application-agent -> project-local
mkdir -p ~/personal/web-portfollio/.agents/skills
mv ~/.agents/skills/job-application-agent ~/personal/web-portfollio/.agents/skills/
```

F. Package filters. Edit `~/dotfiles/pi/.pi/agent/settings.json` `packages` by hand, or use `pi config`:

```json
{ "source": "npm:pi-lens", "skills": ["!skills/pi-lens-write-*"] },
{ "source": "npm:@llblab/pi-telegram", "skills": ["!dist/skills/generative-apps/**", "!dist/skills/generated-control-surface/**"] },
{ "source": "npm:pi-btw@0.8.1", "skills": [] }
```

These replace the string entries `"npm:pi-lens"`, `"npm:@llblab/pi-telegram"` and `"npm:pi-btw@0.8.1"`. After `/reload`, check the `<available_skills>` list.

G. Trims: edit the `description:` field of the 10 skills in §5 and the 6 project skills by hand. Target ≤300 chars, keeping what the skill does and when to use it.

## 7. Unconfirmed

- The token counts are estimates (chars/4). No tokenizer was run.
- I did not test the glob path syntax of the package `skills` filter (relative to package root, `!dir/**` vs a SKILL.md path). Pi docs show only `extensions/*.ts`-style examples.
- `npx skills update` (from `~/.agents/.skill-lock.json`) may reinstall moved Cloudflare skills into `~/.agents/skills`. Not tested.
- I did not check whether `job-application-agent` uses absolute paths or `~/.agents/job-application-agent` state that breaks after a move. Its SKILL.md has no `~/.agents` path, but its scripts were not read.
- Project `.pi/settings.json` files may need project trust before Pi honors their `skills`. Not tested.
- Field use is a heuristic. A read in another repo can still be an edit or audit, and a skill used through memory without a read is invisible.
- The `rust-best-practices` and `tauri-v2` subagent injections reference skills found in no audited source. They are probably project-local in other repos. Not traced.
- The pi-btw skill's creation date is unknown.
- I did not check whether the adw extension reads `extensions/adw/skills` at runtime outside adw runs.
