# cloudflare/security-audit-skill: evaluation for Pi

**Verdict: install with a small Pi adaptation.** Fold three ideas into `extension-security-audit`. Run a `quick`, source-only audit on rolecraft-ai first.

## 1. Pinned revision and what I read

- Repo: https://github.com/cloudflare/security-audit-skill, MIT.
- HEAD of `main`: `c1c8a8c1471069fb0e188eeaff69b8e8db6564a8`, "Clarify guidance and full audit modes", 2026-09-14, unsigned. Source: GitHub API `commits` and `git/trees/main`.
- The skill lives in `skills/security-audit/`. It has `SKILL.md` (22 KB), `RECONNAISSANCE.md`, `HUNTING.md`, `VALIDATION-AND-REPORTING.md`, `ATTACK-CLASSES.md`, 10 companion class files, `report-schema.json`, two `.cjs` validators and their tests.
- Read in full: `SKILL.md`, `HUNTING.md`, `RECONNAISSANCE.md`, `VALIDATION-AND-REPORTING.md`, and the repo README.
- Read in part: `ATTACK-CLASSES.md` (first 6 KB of 15 KB), `report-schema.json` (first 5 KB of 14 KB), both validators (first 14 KB of ~33 KB and ~29 KB).
- Not read: the 10 companion files, both `*.test.cjs` files, the tail of each validator, the rest of the schema.
- Blog (published 2026-06-18) read up to the "How we tell it's working" section. The last part, the "North Star" benchmark, was truncated.

## 2. What the skill does

Source: `SKILL.md` "Full audit workflow", `HUNTING.md`, `VALIDATION-AND-REPORTING.md`.

- **Modes.** Guidance mode is the default and writes nothing. Full audit mode runs on an explicit "audit this codebase" request or a request for report artifacts.
- **Phase 1, recon.** 4 `research` agents run in parallel (stack, principals, entry surfaces, local execution). The parent writes a 1,000-word `architecture.md` and a deterministic `coverage-ledger.json`. Each ledger unit is surface × boundary × subsystem × attack class, with a strict state table.
- **Phase 2, hunting.** One `general` hunter per ledger unit or group of closely related units. Each returns one JSON object. A fresh `research` coverage critic runs after each wave. Standard and deep profiles add a separate final-clean critic. The loop continues until a critic reports nothing new.
- **Phase 3, validation.** Every unique candidate goes to a fresh verifier whose prompt starts "You did not write this candidate. Try to refute it". A verifier may return confirmed, needs_validation or rejected.
- **Phase 4, structured output.** The parent writes `findings.json`, then runs the two validators.
- **Phase 5, record verification.** One fresh verifier per confirmed or needs_validation record. A material replacement needs yet another fresh verifier.
- **Phase 6, reports.** `REPORT.md`, `FINDINGS-DETAIL.md` and `NEEDS-VALIDATION.md`, derived from the verified records and the ledger.
- **Profiles.** `quick`, `standard` (default) and `deep`. Profiles change breadth only, never the evidence bar. An optional strict agent-count budget stops the run as `incomplete` rather than thinning evidence.
- **Re-runs are additive.** Prior ledgers and findings are read, and prior needs_validation and changed-source units become current work. The README claims one run finds roughly half of what repeated runs find.
- **The two validators.** The `.cjs` files check structure and ledger consistency only (`VALIDATION-AND-REPORTING.md` Phase 4: "Validator success proves format and ledger consistency only").

## 3. Phase mapping to Pi primitives

The skill is written to be agent-neutral. `SKILL.md` "Platform terminology" defines parent, Task tool, `research` agent and `general` agent, and says to "use equivalent platform capabilities". It contains no hooks and no Claude-specific paths. It does mention `npx skills add` and a default output path `~/security-audit-skill/<repo>/run-<N>`.

| Skill concept | Pi equivalent | Note |
|---|---|---|
| Parent | the orchestrator session | It must be the only writer of shared files. |
| Task tool | `subagent`, plus `subagent_message` and `subagent_close` | The result arrives as a follow-up steer message, not as a return value (subagents `README.md` "Lifecycle"). |
| `research` agent (recon, critics, Phase 5) | profile `explore` or `analyzer` | These are read-only and have no web tools (`agents/explore.md:5`, `agents/analyzer.md:5`). Pi's `research` profile has `web_search` and `web_read` (`agents/research.md:5`). Avoid it for a target containing untrusted text. |
| `general` agent (hunters, verifiers) | profile `review` for source-only work | It is Opus, read-only plus `safe_bash` (`agents/review.md:5`). Pi's `general` has `write`, `edit` and `bash` on the host (`agents/general.md:5`), which the skill's sandbox rule forbids. |
| OS-enforced sandbox for target code | `isolation: "container"` with `network: "offline"` | Details below. |
| Agent ID regex `^[a-z0-9][a-z0-9_-]{0,63}$` | the subagent `name` | Use the agent ID as the name. Whether Pi's name rules conflict is unconfirmed. |
| Scratch and artifact promotion | not needed in source-only mode | All checks use `method: "source"` and `artifact: null`. |

**Sandbox.** The skill requires an OS-enforced sandbox before running any target code. Without one, it says to keep the lead as `needs_validation` instead of executing (`SKILL.md` "Universal execution safety"). Pi's container isolation covers most of this:
- Offline network, no host environment, no host mounts, read-only root, 256 processes, 2 GB memory, 2 CPUs, 4-hour backstop (subagents `README.md` "Container isolation").
- Gaps: the only bundled container profile is `audit` (`agents/audit.md:5`), and it is tuned to hunt malware.
- Container children also have skills, `AGENTS.md` and `ask_question` turned off. That is fine, because the skill copies its prompts into the hunter prompt verbatim.
- The image is a Debian base without bun, so rolecraft-ai tests probably cannot run offline in it. I did not check this.
- Recommendation: start source-only. The skill supports this, because anything that needs execution becomes `needs_validation` with an exact blocker.

**Scripts.** The two validators are plain Node `.cjs` files with no dependencies.
- Imports at the top of `validate-coverage-ledger.cjs` are `node:fs`, `node:path` and `node:util`. `validate-findings.cjs` imports `fs`, `path` and `util`. Both say "dependency-free".
- In the portions I read there is no network call, no `child_process`, no `eval`.
- Usage: `node validate-findings.cjs findings.json` and `node validate-coverage-ledger.cjs coverage-ledger.json`.
- Not confirmed: I did not read about 19 KB and 15 KB of the two files, so a late `require("http")` or `fetch` is not ruled out. Before installing, run `rg -n "require\(|fetch|http|child_process|eval" skills/security-audit/*.cjs`.

**Exact edits to run under Pi.** Keep upstream files untouched except one patch, so updates stay easy.

1. **Install by pinned copy, not `npx skills add`.** `npx` is unpinned, and `extension-security-audit` step 5 flags exactly that. Copy `skills/security-audit/` at SHA `c1c8a8c1…` to `~/.pi/agent/skills/security-audit/`. The directory name must match `name: security-audit`.
2. **Patch `SKILL.md` "Platform terminology"** (about 8 lines):
   - Task tool means `subagent`.
   - `research` agent means profile `explore`, or `analyzer` for recon and critics.
   - `general` agent means profile `review` for hunters and verifiers.
   - There is no OS sandbox by default, so every run is source-only.
   - Spawn each wave in one turn with `keepAlive: false`, then end the turn. Results arrive as follow-up messages, so do not poll.
   - Every subagent prompt ends with: "Your final message must be exactly one JSON object and no prose. This overrides any final-report formatting rule."
3. **Why the JSON override matters (inference).** Pi appends final-report rules to every child prompt (subagents `README.md` "Spawn"): lead with the result and keep file:line evidence. Hunter and verifier prompts demand "exactly one JSON object, no surrounding prose", and the skill says to discard prose-wrapped results without repairing them (`VALIDATION-AND-REPORTING.md` Phase 3 and 5). A wrapped result would cost a re-run. I could not see how the two instructions interact in practice.
4. **Exclusion list in every hunter prompt.** `.env`, `data/`, `node_modules/`, `dist*/`, `test-results/`. rolecraft-ai has a `.env` at its root.
5. **Disambiguate triggers.** Add "for third-party packages before install, use `extension-security-audit`" to the new skill's description. Add "for auditing your own codebase, use `security-audit`" to `extension-security-audit`.
6. **Output directory.** The default `~/security-audit-skill/<repo>/run-N` is outside the repo, as the skill requires. Whether damage-control prompts on that write is unconfirmed.

**Risks specific to Pi.** The subagent tool runs Claude only (subagents `README.md` "Models"). The blog's main advice is to validate with a different model than the one that hunted. Pi can get that diversity from `review_multi` (Opus, GPT, GLM, Opus). The parent also carries heavy context: it must copy attack-class blocks verbatim into each hunter prompt. State lives on disk, so a run is resumable, but plan a handoff if the parent fills up.

## 4. Cost and wall time for a medium repo

These counts come from the skill's own rules. Rolecraft-sized means about 280 TS/TSX files, which is an approximate figure (see section 7).

- **Rules.** One ledger unit is roughly one hunter. One candidate costs one verifier in `quick` and two in `standard` or `deep` (`SKILL.md` "Cost budget"). `quick` is exactly one hunter wave and one final critic. Recon is 4 agents plus optional focused ones.

| Profile | Recon | Hunters | Critics | Verifiers (Phase 3 + 5) | Total (my estimate) |
|---|---|---|---|---|---|
| `quick` | 4 | 8–12 | 1 | 1× per candidate, ~6 → 6 | about 20–25 |
| `standard` | 4 | 20–30 in wave 1, then 8–12 | 3–4 | 2× per candidate, ~10–15 → 20–30 | about 60–80 |
| `deep` | 4+ | 40+ | many | 2× per candidate, 20+ | 100–200+ |

- The unit counts and candidate counts are my guesses, not figures from the skill. The blog's validation rejection rate went from 40% to 11% (blog, "How we tell it's working"), which suggests many candidates survive.
- **Where the spend goes.** The blog says "almost all of the compute budget goes directly into the hunt stage", and a gap-fill pass costs about half the initial hunt ("What it costs"). It reports a worst case of 14 hours on a complex repo, but with 50–200 workers.
- **Tokens and dollars.** Each hunter prompt carries `architecture.md`, the selected attack-class blocks, the method, and the schema branches. Hunters then read deeply. I have no basis for a dollar figure, and I did not estimate one. Measure the first `quick` run.
- **Wall time, my estimate for Pi.** Recon 5–10 min. Hunter wave 20–40 min if the tmux agents run in parallel. Critic 5–10 min. Verifiers 10–20 min. That is about 30–50 min for `quick` and 1.5–3 h for `standard`. The tmux window and API rate limits on parallel children are unconfirmed.
- **Budget control.** Set a strict budget in `run-metadata.json`. The skill reserves critic and verifier calls first and ends as `incomplete` rather than silently thinning.

## 5. Comparison with what you have

**`review_multi`** (`extensions/superpowers/reviewer.ts:624-650`) runs four models, each giving independent merge-blocking findings from shared exploration context. Reviewers are told to use at most 5 verification tool calls (line ~55 of the prompt).
- It has no coverage tracking, no per-finding disprove step, no verdict taxonomy, no persistence across runs, and it is aimed at a diff or a focus area.
- The skill adds, for a whole repo:
  - Attack-class hunters with an explicit trust-boundary model.
  - A ledger that says what was not covered.
  - A verifier that did not find the issue and tries to refute it.
  - A needs_validation bucket for facts outside source.
  - Schema-checked output and additive re-runs.
- `review_multi` is still the better tool for PR review and cheap second opinions. It is also the only way to get different model families.
- Use both. Run the skill, then feed each confirmed finding to `review_multi` with a focus string stating the claim, as the cross-model verifier the blog recommends.

**`extension-security-audit`** (`.pi/skills/extension-security-audit/SKILL.md`) audits third-party packages before install, statically, with a capability table and a drift check. Different purpose, no overlap in trigger.

**Worth folding into `extension-security-audit`:**
1. **Per-finding verdicts.** Add confirmed, needs_validation (with the exact missing fact) and rejected to each finding. Today it has only a report-level verdict (step 6). The rule that severity needs demonstrated impact, and that a missing second layer is a hardening note and not a finding, also fits.
2. **Disprove pass.** For any "High observed risk" claim, spawn a fresh `review` subagent that sees only the claim and tries to refute it.
3. **A light file ledger.** List every file that runs or instructs, marked read or unread. This formalises step 2 and the "Limits" paragraph. The full 5 MiB JSON ledger would be overkill for a package review.
4. Not yet read, but promising as rubric content: `SUPPLY-CHAIN-AND-RELEASE.md` and `AI-AND-LLM.md` (prompt injection, MCP identity, tool schemas). Read them before deciding.

## 6. Recommendation and first audit on rolecraft-ai

**Install with a small adaptation** (section 3, edits 1–6). Do not install as-is: the sandbox and role names do not map, and the JSON-only contract may be broken by Pi's appended final-report rules. Borrowing ideas only would give up the main value, which is the ledger-led loop with independent verifiers.

**Target facts.** `~/personal/projects/rolecraft-ai` is a Bun, Hono, React, Drizzle and Postgres app with a browser extension (`package.json`). It is local-first and single-user with no login (`SECURITY.md`). `SECURITY.md` already lists a known SSRF gap in add-by-link, with no DNS pinning.

**Suggested first run (do not run until you confirm):**
1. Install per section 3, then run the `rg` check on the `.cjs` files.
2. Say: "security audit ~/personal/projects/rolecraft-ai, profile quick, budget 30 agents, source-only, output ~/security-audit-skill/rolecraft-ai/run-1, exclude .env data/ node_modules/ dist*/".
3. Companion files worth selecting from what I read of the routing: `WEB-PROTOCOL-AND-AUTH.md` (localhost API, DNS rebinding, CSRF, extension pairing tokens), `CLIENT-SIDE.md` (extension and SPA), `AI-AND-LLM.md` (job-posting text reaching the model), `RESOURCE-EXHAUSTION-AND-AVAILABILITY.md` (AI budget spend). Skip data isolation unless the threat model changes.
4. Give hunters the `SECURITY.md` known limitations as context so they do not re-report them as new.
5. Expect partial coverage: `quick` is stated as a partial pass. After reading the report, decide on a `standard` run.
6. Close each subagent after you accept its result (`AGENTS.md`). Do not commit or push anything.

**Cashflowy.** I could not find a local project. The only local mentions are Cashflowy as an employer in `web-portfollio/app/routes/resume/constants/experience.ts:7` and a portfolio entry linking https://cashflowy.ai/ (`web-portfollio/app/routes/home/constants/portfolio.ts:87-92`). It is likely a private employer repo outside `~/personal`. Stack and size are unknown. I did not audit anything.

## 7. What I could not confirm

- I did not read the 10 companion class files, the tests, the tails of the two validators, or the rest of `ATTACK-CLASSES.md` and `report-schema.json`.
- I could not rule out network or `child_process` use in the unread validator tails.
- The blog's last section (the benchmark) was cut off in my fetch.
- Rolecraft file counts come from fuzzy search counts (about 222 `.ts`, 59 `.tsx` in `src/`, 51 `.ts` in `extension/`) and are approximate.
- Agent-spawn totals, wall times and the claim that Pi's appended final-report rules would break JSON-only output are my estimates.
- Whether damage-control blocks writes to `~/security-audit-skill/`, what `safe_bash` allows, Pi's subagent name constraints, and the concurrency cap on tmux children are unconfirmed.
- The container image having no bun is inferred from "Debian base", not checked.

## Orchestrator verification (2026-11-18)

Both validators were read in full at `c1c8a8c1`: `validate-findings.cjs` (28.8 KB) and `validate-coverage-ledger.cjs` (33.5 KB) import only `fs`/`node:fs`, `path`/`node:path` and `util`/`node:util` (lines 8–13). Neither contains `fetch`, `http`, `child_process`, `eval` or `new Function`. The open item about network use in the unread validator tails is closed.
