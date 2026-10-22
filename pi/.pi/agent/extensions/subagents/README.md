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
  isolation: "shared",
})
```

`profile` is optional and defaults to `general`. Bundled profiles are `general`, `explore`, `research`, `review`, and `implement`, plus the read-only `locator`, `analyzer`, and `pattern-finder` research profiles. Names describe tasks and remain stable for messages and resume.

## Models

Subagents run on Claude regardless of the session default in `settings.json`. Each bundled profile pins a model, and `DEFAULT_SUBAGENT_MODEL` (`anthropic/claude-sonnet-4-6`) catches any profile that omits one.

| Profile | Model |
|---|---|
| `general` | `anthropic/claude-sonnet-4-6` |
| `explore` | `anthropic/claude-sonnet-4-6` |
| `research` | `anthropic/claude-sonnet-4-6` |
| `review` | `anthropic/claude-opus-5-5` |
| `implement` | `anthropic/claude-opus-5-5` |

Precedence is `params.model`, then the profile's `model:` frontmatter, then `DEFAULT_SUBAGENT_MODEL`. Profiles in `~/.pi/agent/agents/` shadow bundled ones of the same name. Agents with `cli: claude` are exempt, since the Claude Code CLI uses its own model naming.

`isolation` defaults to `shared`, which runs in the caller's cwd. Use `worktree` for parallel writers. Worktree creation delegates to the existing `WorktreeManager`; this extension never commits, merges, pushes, or removes worktrees automatically.

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
