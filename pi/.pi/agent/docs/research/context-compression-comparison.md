# Context compression: billion-context vs pi-vcc + condensed-milk

Date: 2026-11-17. Evaluated revisions: billion-context `a259e0b` (2026-11-17, npm 0.1.216), acp-kernel `4d38906` (2026-10-03, 0.0.101; billion-context ships its own vendored copy, `package.json:78` `"acp-kernel": "file:./kernel"`), pi-vcc 0.11.2, condensed-milk 1.13.1, Pi 1.5.2. billion-context was read only. It was not installed, run, or put in the request path.

## Summary verdict

**Keep the current stack. Do not trial billion-context ("bili") as a daily driver now.** Our local logs show that pi-vcc + condensed-milk already get a 93.3% cache-read share across 39,285 calls (see Efficiency). That is in the same range as bili's own measured production figure (90.7% blended, paper §6.3). Bili's README headline of 96–99% does not match that figure. Bili's real advantages are incremental model-driven folds that leave the prefix before the fold intact, and multi-generation summaries. These matter mainly for sessions much longer than ours. To get them we would take on: a 173K-line proxy that holds every API key, auto-updates itself from npm every 3 minutes, and can force-install versions (including rollbacks); a non-standard license; a cancel of pi-vcc's automatic compaction; and benchmarks whose "independent" evaluator is anonymous and published no raw data. **Borrow three ideas instead** (see Recommendation). A trial is reasonable only in an isolated profile under the benchmark conditions below.

## Comparison table

| Dimension | billion-context | pi-vcc (compaction + `vcc_recall`) | condensed-milk (masking + filters + `cm_recall`) |
|---|---|---|---|
| Form | Local HTTP proxy or MITM. In Pi "native" mode, an extension starts a child proxy and patches `globalThis.fetch` | In-process Pi extension, 5.5K LOC, no runtime deps | In-process Pi extension, 5.7K LOC, no runtime deps |
| Who decides | The model calls injected `compress` / `decompress` / `search_context` / `acp_status` tools. A growth nudge (~50K tokens) and a preflight backstop push it | Pi's threshold/overflow trigger. The summary is algorithmic, with no LLM call | Context-usage zones (30/45/60%), boundary, and idle-TTL events. Deterministic |
| Recall | `decompress` from proxy-side state (`~/.local/share/billion-context`) | `vcc_recall` reads the raw session JSONL. `expand` returns full text | `cm_recall` reads the session file by id. README reports byte-identical recall on 8,314 masked calls |
| Cache prefix | Append-only. A fold rewrites only from the fold point onward. Summaries are re-voiced as `user` so the head system message stays byte-stable | Each compaction rewrites everything after the system prompt and tools | Byte-stable placeholders. The cutoff is frozen between events, and each event costs one rewrite |
| Measured savings | Self-reported: −31…−54% billed tokens (pilot, n≤3), −58…−71% cost (anonymous third party) | Self-reported 97.6% median summary-size reduction (1,884 sessions). Local: ~190K tokens → ~8.4K chars per compaction | Self-reported −11.9% cost [−21%, −5%] (38 sessions replayed). Local: filters removed 49.7% of chars on 279 filtered bash results |
| Failure mode | Proxy bootstrap fails → traffic goes direct and uncompressed. Probe failure → defers to native compaction | Throws → Pi core compaction | Mask pass fails → raw context is sent |
| Trust surface | Sees all traffic and keys; auto-updates from npm; forced advisories; MIT plus an attribution term | Local only, MIT | Local only, MIT. Telemetry is opt-in and local, and is off here |

## Usability

- **Install/ops.** `npm i -g billion-context`, then `bili plugin install pi`. This writes a `billion-context` entry into Pi settings (README.md:100, 124). Native mode starts a child proxy on an ephemeral port. Its parent-pid watchdog is the Pi process (`src/agent/pi-native.ts:1-25`). `bili start` uses 8787, and lanes use 18787+ with port hopping (README.md:164). An opt-in `inline` mode runs with no proxy process (`pi-native.ts:13-16`). The proxy has no authentication. It binds loopback by default (README.md:493). Ours are two `npm:` entries in `settings.json:33-34`, with no process or port.
- **API keys pass through it.** In native mode, every model request is rewritten to `<proxy>/bili/<upstream>` (`pi-native.ts:8-10`). The Pi extension also POSTs each provider's "resolved API key" to the proxy for summary dispatch. Those keys are kept in memory only (docs/configuration.md:1414). The proxy hashes credentials to detect key switches (README.md:375).
- **Pi support.** Bili claims Pi support. However, its devDependency pins `@earendil-works/pi-coding-agent` **0.83.0** (`package.json:72`). We run 1.5.2. Its third-party ContextBench run used Pi 0.73.1. I found no evidence that bili was tested on Pi 1.x. Native mode also adds `acp_delegate*` subagent tools by default. Its stand-down check looks only for the `pi-subagents` package (README.md:247, 597-613), and our subagent extension is local. Set `pi.subagents:false` to avoid two subagent systems.
- **What the user sees.** Bili adds `/acp` and `/acp-cache` commands, a web UI on localhost, and `[acp-usage]` lines in `~/.local/state/billion-context/bili.log`. The client's own session file is never shrunk and grows without bound (README.md:405-416). Ours: pi-vcc shows a toast and summary after compaction, and condensed-milk shows `/compress-stats` and a status line.
- **Recall.** Bili uses `decompress`/`search_context`, but the model must choose to call them. Bili's own pilot recorded "spontaneous tool adoption is zero at this model scale" (paper:267). Ours: `vcc_recall` (273 calls in 30 days) and `cm_recall` (185 calls) are both in active use.
- **Proxy dies.** If bootstrap fails, a log line says "model traffic goes direct (uncompressed)" (`pi-native.ts:167`). After a mid-session death, compaction-cancel ownership falls back to native compaction ("Probe failure … defer to native compaction", `src/agent/pi.ts:1039-1041`). README.md:542 states that injection breakage leaves traffic "direct and uncompressed" until the host restarts. Long-lived proxies can also hit stale DNS after VPN changes, which shows up as HTTP 502 (README "Stale local DNS"). Ours have no separate process that can fail.

## Performance

- **Added latency.** Bili adds a loopback hop and SSE re-streaming on every request, but publishes no latency numbers. Searches of the README and docs for latency or overhead figures found none. In plugin mode each fold is an extra model tool turn, because the `compress` call stays in the agent's history (docs/technical-notes.md:200-212). pi-vcc reports compaction latency of 1 ms median and 348 ms worst (README:20). condensed-milk runs a synchronous pass on each `context` event.
- **Prompt cache.** Bili: "history is append-only and compression deactivates only suffix ranges" (paper:204). The README promises 96–99% (README.md:48). The paper measured 90.7% blended over 4.5 months and 94.2% for calls less than 2 minutes apart (paper:204), using cache-read/(cache-read+fresh). condensed-milk: placeholders are byte-identical, and each mask event triggers one rewrite (README:43, 51, 93). pi-vcc: each compaction is a full rewrite after the tools and system prompt.
- **At compaction time (local data).** On the first assistant call after each of 222 compactions, the median cache-read share was **53.7%** (47.3% aggregate), against a 93.3% baseline. This is the cost bili's design avoids. However, compactions are rare (227 in 30 days), so their effect on the 30-day total is small.

## Efficiency

**Our stack, local measurements** (read-only Node scan of `~/.pi/agent/sessions/*/*.jsonl` changed in the last 30 days; scripts `/tmp/bc-eval-stats/s.mjs` and `s2.mjs`):
- 261 session files (subagent sessions included), 39,285 assistant calls, 46,314 tool calls.
- Tokens: cacheRead 3.847B, cacheWrite 252.2M, uncached input 25.0M, output 27.0M. Cache-read share is **93.3%** with writes counted as non-hit input. It is **99.35%** with bili's formula of cache-read/(cache-read+fresh), where writes are excluded. Per-session median is 94.0%, and p10 is 88.2%.
- 227 compactions in 50 sessions, 220 of them stamped `compactor:"pi-vcc"`. tokensBefore: mean 190.6K, median 181K, max 824K. Summaries: mean 8,417 chars (≈2.1K tokens), which is about 98–99% smaller than the context they replaced. Maximum was 38 compactions in one session.
- condensed-milk filters: 279 bash results carry `details.condensedMilk`. Their raw text totals 971K chars, and the filtered text totals 489K chars, a **49.7%** reduction. This is a lower bound, because results with withheld raw count only on the output side. Masks are applied in the `context` event and are not persisted. Telemetry is off (no `~/.config/condensed-milk-sessions.jsonl`), so the number of `[cm-masked]` placeholders cannot be counted from logs.

**billion-context evidence, with caveats:**
- *Paper* (paper/…md). Single author: the developer, Xianglei Ran. The data is "observational, single-user, daily-driver usage" (paper:150): 174K calls and 18.76B input tokens on GLM-5.x. It measures boundedness (zero window violations) but "not task quality". The controlled pilot (§8.1, paper:234-277) used v0.1, a local qwen3.8-27b, n=1–3 seeds, and synthetic workloads. It reported −31…−54% billed tokens against a retention baseline. Its own ablation attributes the 2.7× drop in re-fetches to the doctrine text and ref tags, not to compression: with compression idle, those alone gave −62% re-fetches. The 5.3× long-run savings figure is marked **[A] analytical** (Appendix B, paper:311). The comparison against threshold auto-compaction or LCM (§8.2) is **planned, not run**.
- *Third-party benchmark* (benchmarks/third-party-1500/README.md). The evaluator is not named, and no contact, harness code, raw outputs, or logs are published. The directory holds only a README and PNGs. It covers one model (DeepSeek V4.1 Flash), bili v0.1.202, and a single run, with no confidence intervals. The cost savings use a counterfactual baseline. On LongMemEval-S the `full` arm was actually billed $0.42 at a 98.1% cache hit rate, but the table reports it as "$7.97 independent-session". No arm compares against an agent's own compaction or masking: the arms are `full` and three RAG variants. Accuracy loss is real: LME 79.2% vs 83.2% for `full`, and MAB verbatim retrieval (AR) **27.0% vs 69.0%** for `full`. ContextBench (Pi 0.73.1): F1 0.3097 vs 0.2928 and cost $4.61 vs $11.05. These are the most relevant numbers for us, but the `full` arm's compaction settings are not stated.

## Fidelity

- **billion-context.** Summaries are lossy by design (MAB AR 27% EM). Originals stay in proxy state, and `decompress` restores the exact range "without disturbing the cached prefix" (paper:267; 6/6 restore probes, but only when the model was told to restore). Recovery depends on bili's own store and on its content-derived message identity. Host rewrites of message content are a known source of drift (docs/message-identity.md:121, 265, 406).
- **pi-vcc.** The summary is an extraction, so details outside the brief are dropped from context. They remain in the session JSONL, and `vcc_recall {expand:[N]}` returns the full text (README:112-131). Recall is limited to the current session.
- **condensed-milk.** Masked results are byte-exact via `cm_recall`, which re-reads the session file on every call (`io/recall-tool.ts:1-7`). Filtered bash output keeps the raw text in `details.condensedMilk` up to 51,200 bytes (`filters/recall.ts:30`). Raw text is withheld for secrets and for larger outputs (`index.ts:1604-1609`).

## Security and trust

- **Traffic and keys.** Bili sees every prompt, response, and API key, and stores conversations under `~/.local/share/billion-context` (README "Where are logs"). Native mode patches `globalThis.fetch` inside the Pi process.
- **Supply chain.** Bili checks npm on startup and every 3 minutes, then **installs new versions in place** after a 15 min–48 h staggered delay (README.md:536-538). A separate advisory channel (`billion-context-advisories` on npm) **force-installs** a `target` version, which may be older, even when `autoUpdate` is off. Disable it with `advisoryCheck:false` / `BILI_ADVISORY_CHECK=0` (README.md:556). Bili also fetches `auto-update-policy.json`, `announcements/remote.json`, and blog content from GitHub. The source references registry.npmjs.org, registry.npmmirror.com, api.github.com, raw.githubusercontent.com, and models.dev. I found no analytics SDK: a grep of `src/` for telemetry, posthog, sentry, and mixpanel showed only log lines.
- **Size and churn.** 323 TS files and 172.7K lines in `src/`, plus a 26.2K-line vendored kernel. Issue numbers reach #5796, and there have been 216 patch releases of 0.1.x. Runtime deps: `mysql2`, `zod`, and optional `jimp`.
- **License.** GitHub shows NOASSERTION because `LICENSE:25-43` adds an "Attribution on Product Surfaces" term to MIT. Any user-facing product that uses the software must credit billion-context and acp-kernel. Private local use is unaffected, but this would matter if code were borrowed into published packages. Writing our own versions of the ideas avoids the term. acp-kernel carries the same term.
- **Ours.** Both are MIT and have zero runtime dependencies. condensed-milk telemetry is opt-in and local only (`index.ts:507-511`). Neither extension makes network calls.

## Coexistence

- **bili + pi-vcc.** pi-vcc does not double-compress, but its automatic compaction stops. Bili cancels Pi's threshold and overflow compaction whenever it carries the session (`src/agent/pi.ts:999-1060`). Pi's runner returns on the first `cancel` (`pi-coding-agent/dist/core/extensions/runner.js:829-832`), so pi-vcc's automatic path never takes effect. A manual `/compact` or `/pi-vcc` still runs, and then **both** layers act on the same history. Whether bili re-anchors cleanly after the client history shrinks is unconfirmed. If the proxy probe fails, pi-vcc takes over again, so automatic ownership switches with proxy health.
- **bili + condensed-milk.** condensed-milk masks in the `context` event, before bili's fetch patch. Bili would therefore fold placeholders instead of real outputs. Each mask event also rewrites older tool results, which bili's message identity treats as a content mutation. Impact unconfirmed.
- **pi-vcc + condensed-milk.** These two work together: condensed-milk resets its cutoff on `session_compact` (`index.ts:481`). They are designed to run together, which our 30-day data reflects.
- Bili states that its own native and standalone (`billion-context-pi`) modes must not run together, because both active means double compression (README.md:124).

## Recommendation

1. **Keep pi-vcc + condensed-milk.** The cache-read share is already 93% (99% by bili's formula), recall tools are in active use, there is no extra process, and neither extension makes network calls.
2. **Borrow ideas without copying code** (this also avoids the attribution term):
   - *Cache-miss attribution report.* Bili's `/acp-cache` sorts misses into TTL expiry, model switch, key switch, and compression re-pay (README.md:356-380). A `/compress-stats` section that labels post-compaction turns would show the 53.7% dip measured above.
   - *Incremental, earlier compaction.* Bili folds small ranges as the context grows instead of rewriting at about 190K. The equivalent for us is a smaller pi-vcc compaction step (`keepRecentTokens` / `reserveTokens`), so each rewrite costs less. Measure the result before changing defaults.
   - *Doctrine + per-message ref tags.* Bili's own control attributes −62% re-fetches to these alone (paper §8.1). pi-vcc's `#N` refs already do part of this. A short system-prompt line telling the agent to use `vcc_recall {expand}` / `cm_recall` instead of re-reading files would test the same effect cheaply.
3. **Trial bili only under these conditions:** an isolated `PI_CODING_AGENT_DIR` profile; pi-vcc and condensed-milk removed from that profile; a dedicated API key with a spend cap; `ACP_AUTO_UPDATE=0`, `BILI_ADVISORY_CHECK=0`, a pinned version, and `pi.subagents:false`; loopback only; and a check that it works on Pi 1.5.2 before any comparison.

## Proposed fair benchmark (only if trialling)

- **Arms (same Pi 1.5.2 and same Anthropic model):** A = pi-vcc + condensed-milk (current); B = pi-vcc only; C = condensed-milk + Pi core compaction; D = bili native alone (pinned, updates off); E = Pi core compaction only (control).
- **Workload:** 15–20 long tasks drawn from the user's own repos, each driven past at least 2 compactions (≥400K cumulative input), plus a SWE-ContextBench subset for an external anchor. Each task has a fixed prompt script, temperature 0 where supported, and 3 seeds.
- **Metrics:** billed cost from provider usage (input, cache write, cache read, output) at current prices; cache-read share by both formulas; first-turn hit rate after compaction or fold; time to first token and wall time per call (bili's added hop); task success from tests passing; far-recall probes that include **verbatim** needles (identifiers, error strings) as well as semantic facts; number of re-reads; recall-tool calls; failures and restarts.
- **Fault injection:** kill the bili proxy mid-session, block its outbound network, and run a manual `/compact` under D. Record what the user sees and whether the session survives.
- **Reporting:** per-task paired differences with bootstrap 95% confidence intervals. Publish raw usage logs and scripts, and count every failed run.

## Unconfirmed items

- That bili's native mode works on Pi 1.5.2. It pins 0.83.0, and I did not run it.
- Bili's actual per-request latency overhead. No published number exists.
- Who ran the third-party benchmark, and whether its numbers reproduce. No data or harness is published.
- How bili behaves after a manual pi-vcc compaction, and when condensed-milk mask events rewrite older tool results (re-anchoring and drift).
- The README's 96–99% cache claim. The paper's own blended figure is 90.7%, and I found no dataset behind 96–99%.
- Our local figures include subagent sessions and every model used. pi-vcc's own "97.6% median" and condensed-milk's "−11.9%" figures are self-reported, and I did not reproduce them.
- The paper is dated 2026-09-07 (v0.2). The standalone acp-kernel repo (2026-10-03) lags the vendored kernel, so I compared the kernel only through billion-context's tree.
