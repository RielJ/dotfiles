# Extensions usage audit

Date: 2026-11-21. Data: 497 pi session files, 2026-08-16 to 2026-11-21, from
`~/.pi/agent/sessions`. Counts come from `docs/research/usage_audit.py`.
"Field" sessions are sessions outside `~/dotfiles/pi/.pi/agent`, because work
on the extensions themselves inflates the counts in this repo.

Skills were audited on 2026-11-17 in `skills-usage-audit.md`. Section 4 lists
what changed since then.

## 1. What can and cannot be measured

Session logs record tool calls, custom entries, and skill reads. They do not
record extension slash commands or keyboard shortcuts. So:

- Extensions that register tools are measured by their tool calls.
- Command-only and hook-only extensions are judged by what they do, plus
  indirect evidence such as the prompt text a command expands to.

## 2. Inventory and usage

pi loads 20 entries from `packages` in `settings.json` and 17 entries from
`extensions/`. `extensions/pi-tool-display` holds only `config.json` for the
npm package; it is not an extension.

### Used: measured by tool calls

| Extension | Source | Evidence (field sessions, last use) |
|---|---|---|
| `@ff-labs/pi-fff` | npm | `ffgrep` 177, `fffind` 75; 11-20 |
| `pi-lens` | npm | `lens_diagnostics` 118, `module_report` 15, `read_symbol` 14; 11-20 |
| `superpowers` | local | `web_read` 55, `web_search` 52, `plan_multi` 10, `qmd_*` 5, `review_multi` 2; 11-20 |
| `subagents` | local | `ask_question` 58, `subagent` 18, `safe_bash` 21; 11-20 |
| `@juicesharp/rpiv-ask-user-question` | npm | `ask_user_question` 29; 11-20 |
| `@tomooshi/condensed-milk-pi` | npm | `cm_recall` 31; 11-20 |
| `@tintinweb/pi-tasks` | npm | `TaskCreate`/`TaskUpdate` 26; 11-20 |
| `pi-agent-browser-native` | local path | `agent_browser` 19, `agent_browser_code` 12; 11-20 |
| `@sting8k/pi-vcc` | npm | `vcc_recall` 17; 11-20 |
| `memory` | local | `memory_write` 11, `memory_search` 7; 11-20 |
| `git-workflow.ts` | local | `/commit` prompt text in 14 sessions, including this one |
| `image-preview.off` | symlink | Your own extension, used daily |

### Used: passive hooks (no log signal; kept for what they do)

`damage-control` (blocks risky commands), `standing-rules` (re-injects your
rules after compaction), `@tomooshi/caveman-milk-pi` (caveman mode is active),
`pi-tool-display`, `@ogulcancelik/pi-minimal-footer`, `@tmustier/pi-tab-status`,
`pi-notify.ts`, `pi-bash-bg`, `session-utils.ts` (`/clear`), `usage` (`/usage`),
`shortcuts.ts` (`/shortcuts`).

### Low or no use: candidates to remove

| Extension | Evidence | Size | Suggestion |
|---|---|---|---|
| `@llblab/pi-telegram` + `extensions/telegram-question-bridge` | Telegram tools in 1 session, connection state in 2; last 10-21 | 180 files, 20 event hooks, 4 skills | Remove if you no longer drive pi from Telegram. It is the heaviest package loaded. |
| `prompt-snippets` | Snippet text appears only in the 3 sessions where the snippets were written | 7 snippets | Remove. |
| `git-worktrees` | `wt_*` tools in 2 sessions; last 10-28 | 11 files, 7 hooks | Remove. `subagent` with `isolation: "worktree"` covers the same need. |
| `adw` | `adw_list` once (10-18); newest run 07-29 | 115 files | Unload from `extensions/`; load it with `pi -e` while developing it. |
| `pi-mcp-adapter` | `mcp` tool in 3 sessions, `mcp__finops` in 1; last 11-18 | 152 files, 11 hooks | Keep only if you need its features. pi now has a built-in MCP client (`pi mcp add`), which the adapter replaces. |
| `pi-btw` | 2 sessions; last 11-11 | 3 files | Keep (cheap), or remove if `/btw` isn't part of your habits. |

### Unknown: command or shortcut only

These cannot be measured from logs. Keep them only if you remember using them:

- `pi-promptsmith` (`alt+p` prompt rewriter)
- `pi-token-burden` (`/token-burden`)
- `pi-skills-sh` (`/skills`)
- `pi-skill-toggle` (`/skills-toggle`)
- `pi-vim` (vim keys in the editor)

### Workarounds that pi may now cover

| Extension | Added | Possibly covered by | Check |
|---|---|---|---|
| `anthropic-tool-schema-compat` | 10-23 (Opus 5 rejects `minimum`/`maximum`) | pi 0.99.2: tools with such keywords "are now sent non-strict" | Disable it, run one Opus 5 turn that loads pi-lens tools, and watch for a 400. |
| `image-media-type-guard.ts` | 06-30 (images without `media_type` give a 400) | Later pi image MIME detection | Disable it, paste an image, then resume that session. |

## 3. Already removed

- `@ayulab/pi-rewind` (2026-11-21): never used, made every turn print
  "Checkpoint failed", and had stored 34 GB of checkpoints.

## 4. Skills: changes since the 2026-11-17 audit

The recommendations in `skills-usage-audit.md` still hold. None of them were
applied. New usage since then:

- `cloudflare` got its first field use (11-20). The other 21 Cloudflare skills
  still have none; they are now 5 days old.
- `principles`, `tdd`, `teach`, and `improve-codebase-architecture` were used
  on 11-20.

Still unused or unused in the field:

- User skills: `handoff`, `interview`, `ste`, `blast-radius`, `validate-plan`,
  `break-ui`, `review-animations`. Hidden (no prompt cost): `prototype`,
  `pick-ui-library`.
- Project skills: `agent-recovery-testing`, `agent-tool-design`,
  `contract-testing`, `agent-evaluation`, `extension-security-audit`,
  `shell-safety` (audit reads only).
- Package skills: `pi-lens-write-ast-grep-rule`,
  `pi-lens-write-tree-sitter-rule`, `generative-apps`,
  `generated-control-surface`, `btw`.
