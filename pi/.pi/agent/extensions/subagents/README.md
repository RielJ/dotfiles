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

`profile` is optional and defaults to `general`. Bundled profiles are `general`, `explore`, `research`, `review`, and `implement`. Names describe tasks and remain stable for messages and resume.

`isolation` defaults to `shared`, which runs in the caller's cwd. Use `worktree` for parallel writers. Worktree creation delegates to the existing `WorktreeManager`; this extension never commits, merges, pushes, or removes worktrees automatically.

## Tools

- `subagent`
- `subagent_message`
- `subagents_list`
- `subagent_attach`

The upstream completion widget, named resume, sandbox loadout, and `ask_question` flow are retained. Children launch with `--no-extensions` and explicit tool allowlists.

## License

See `LICENSE` and `NOTICE`. Substantial upstream code remains covered by its MIT notice.
