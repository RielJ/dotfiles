# Neovim config modernization — TODO

**Audited:** August 2026
**Environment:** Neovim `v0.12.0-dev-1039`, lazy.nvim, 77 plugins in `lazy-lock.json`, 44 loaded eagerly.

This document tracks the work needed to bring this configuration in line with what
Neovim 0.11/0.12 provides natively, remove dependencies that upstream has archived or
superseded, and decide on the TypeScript toolchain now that TypeScript 7.0 has shipped.

Each item is independently revertible. Tiers are ordered by risk, not by value: Tier 1
items cannot break your workflow, Tier 5 items change muscle memory.

---

## Tier 1 — Free wins ✅ DONE

Nothing here changes how the editor behaves for you. Do these first.

Completed August 2026. Gotcha discovered during execution: lazy.nvim keys clones by plugin
*name*, not URL, so editing a spec's owner does **not** re-point an existing clone. The four
renames needed `git remote set-url origin <new>` inside the lazy root, followed by
`:Lazy! update`. Also note this config's lazy root is `$XDG_DATA_HOME`-relative —
`/Users/rielj/.config/local/share/nvim/lazy`, not `~/.local/share/nvim/lazy`, which still
holds a stale unused tree.

- [x] **Remove `vim.deprecate = function() end` from the last line of `init.lua`.**
      This silences every deprecation warning that Neovim core and nvim-lspconfig emit.
      It is the reason the `tsgo` → `tsc` rename (item below) went unnoticed. Removing it
      makes the config self-reporting: future breakage announces itself instead of
      accumulating silently.

- [x] **Drop `impatient.nvim`; call `vim.loader.enable()` instead.**
      The plugin was archived in May 2023. Its README states: *"As of Neovim 0.9, this
      plugin is no longer required. Instead run: `vim.loader.enable()`"*
      ([repo](https://github.com/lewis6991/impatient.nvim)). You currently load it eagerly
      and call `enable_profile()`, and `vim.loader.enable()` appears nowhere in the config —
      so you are running the deprecated cache and not the core one.

- [x] **Drop `popup.nvim`.**
      Still marked `[WIP]` upstream, last push 2024-06. Telescope's README lists only
      `plenary.nvim` under Requirements
      ([telescope README](https://github.com/nvim-telescope/telescope.nvim#requirements)),
      and nothing else in this config references it. It is loaded eagerly for nothing.

- [x] **Fix four renamed repositories.**
      All four currently work via GitHub 301-redirects, which lazy.nvim follows silently —
      until a fresh clone on a new machine, or until the redirect is retired.

      | Spec says | Actual home |
      |---|---|
      | `williamboman/mason.nvim` | [`mason-org/mason.nvim`](https://github.com/mason-org/mason.nvim) |
      | `windwp/nvim-spectre` | [`nvim-pack/nvim-spectre`](https://github.com/nvim-pack/nvim-spectre) |
      | `narutoxy/dim.lua` | [`0oAstro/dim.lua`](https://github.com/0oAstro/dim.lua) |
      | `dmtrKovalenko/fff.nvim` | [`dmtrKovalenko/fff`](https://github.com/dmtrKovalenko/fff) |

- [x] **Unpin `fidget.nvim` from `tag = "legacy"`** in `lua/custom/plugins/lsp.lua`.
      Upstream released **v2.0.0 on 2026-06-21**
      ([releases](https://github.com/j-hui/fidget.nvim/releases)). You are pinned to the
      pre-rewrite tag and have been for years.

- [x] **Run `:Lazy clean` to prune stale lockfile entries.**
      `lazy-lock.json` still pins `playground` — **archived**, last push 2023-09, superseded
      by core `:InspectTree` ([repo](https://github.com/nvim-treesitter/playground)) — and
      `nvim-treesitter-textobjects`, which is not declared in any spec.

---

## Tier 2 — Dead and dying dependencies (mostly done)

Small behaviour changes. Each replaces something upstream has stopped supporting.

- [x] **Replace `bufdelete.nvim`.** → `nvim-mini/mini.bufremove` (`version = "*"`).
      `<leader>c` now calls `require("mini.bufremove").delete(0, false)`.
      The repository is **archived** (GitHub API reports `archived: true`, last push 2024-02)
      ([repo](https://github.com/famiu/bufdelete.nvim)). Your `<leader>c` maps to `:Bdelete`.
      Drop-in replacements that preserve window layout:
      [`snacks.bufdelete`](https://github.com/folke/snacks.nvim/blob/main/docs/bufdelete.md)
      or [`mini.bufremove`](https://github.com/nvim-mini/mini.nvim/blob/main/readmes/mini-bufremove.md).

- [ ] **Drop `supermaven-nvim`.** — **deferred by decision (August 2026).** Inference is still
      free for existing customers, so it stays for now. Revisit when inference stops or when
      an inline-completion replacement is chosen.
      Supermaven was acquired by Cursor and the product was sunset on 2025-11-21. Inference
      continues *"free for existing customers"* only, and agent conversations are gone
      ([Sunsetting Supermaven](https://supermaven.com/blog/sunsetting-supermaven)). The
      plugin itself has not been pushed since 2024-10-07
      ([repo](https://github.com/supermaven-inc/supermaven-nvim)).
      Decide separately whether to replace it. Maintained inline-completion options from
      [awesome-neovim §AI](https://github.com/rockerBOO/awesome-neovim#ai):
      [copilot.lua](https://github.com/zbirenbaum/copilot.lua),
      [windsurf.nvim](https://github.com/Exafunction/windsurf.nvim),
      [minuet-ai.nvim](https://github.com/milanglacier/minuet-ai.nvim).
      Given that you already run `99` plus external agents, "drop and do not replace" is a
      legitimate outcome.

- [x] **Drop `markdown-preview.nvim`.** → replaced by
      [`live-preview.nvim`](https://github.com/brianhuster/live-preview.nvim)
      (`cmd = "LivePreview"`, `ft = markdown/html/asciidoc/svg`, telescope as picker dep).
      No npm build step. `:LivePreview` verified present after a markdown buffer opens.
      Last push 2024-07-23, 264 open issues, and it carries a `npm install` build step
      ([repo](https://github.com/iamcco/markdown-preview.nvim)). You already render markdown
      in-buffer with `render-markdown.nvim`, which is actively maintained (pushed 2026-08-11).
      If a browser preview is still wanted:
      [live-preview.nvim](https://github.com/brianhuster/live-preview.nvim)
      ([awesome-neovim §Live Preview](https://github.com/rockerBOO/awesome-neovim#live-preview)).

- [x] **Resolve the dead `telescope-smart-history` load.** → line deleted; `sqlite.lua` stays
      gone. Telescope prompt history remains in-session only, as it already was.

- [x] **Decide on `nvim-neoclip` + `sqlite.lua`.** → both removed, along with the `<space>fn`
      keymap and `rielj.telescope.neoclip()`.
      Both load eagerly, but the Telescope extension that opens the clipboard picker is
      commented out (`setup.lua:204`, `:206`). As configured you carry a compiled SQLite
      dependency for a UI you cannot open.

- [x] **Low-value eager plugins.** → all three removed: `vim-characterize`, `vim-scriptease`,
      `telescope-media.nvim`. Removing the media extension also required cleaning
      `telescope/setup.lua` (the `canned` require at line 7 and the `extensions.media` block),
      `telescope/init.lua` (`M.media_files`), and the `<space>fm` keymap — the `canned` require
      was a hard dependency that broke telescope's whole `config` until removed.

- [x] **`mini.bufremove` set to `lazy = true`.** It loads on first `require` from
      `plugin/keymappings.lua`, so keymap ownership stays in the `rielj.keymap` seam rather
      than moving into a lazy `keys = {}` spec. `:KeymapCollisions` reports none.

---

## Tier 2b — `:checkhealth` findings ✅ DONE

Result: **17 errors and ~30 warnings → 0 errors and 6 warnings**, all six benign (the
luarocks `lua5.1` note lazy tells you to ignore, plus mason's optional `composer`/`java`/
`javac`/`julia` runtimes for packages not installed). Roughly **734 MB** of disk reclaimed.

Full healthcheck run after Tier 1. No errors attributable to the Tier 1 changes;
`vim.deprecated` reports *"No deprecated functions detected"* even with the stub removed.
What it did surface:

- [x] **Delete ~501 MB of abandoned package trees.**
      `$XDG_DATA_HOME/nvim/site/pack/core` (318 MB, 33 plugins incl. `blink.cmp`, `mini.pick`,
      `typescript-tools.nvim`) and `.../site/pack/deps` (183 MB, incl. `deps/start/mini.nvim`)
      are leftovers from an abandoned Aug-2025 experiment; lazy.nvim's healthcheck flags both
      as "found existing packages". Verified **not** on `'runtimepath'` and `require("mini.pick")`
      fails, so nothing loads them — pure dead disk. Safe to `rm -rf`.

- [x] **17 treesitter query errors from stale parsers.** — root cause was *not* nvim-treesitter.
      A second parser directory, `$XDG_DATA_HOME/nvim/site/parser`, held **320 stale `.so`
      files (233 MB)**, 314 of them duplicating the managed set, installed by the same
      abandoned main-branch experiment as the pack trees. It shadowed nvim-treesitter's own
      parsers on `'runtimepath'`; `:TSUninstall blade` refused with *"the parser is still
      installed (not by nvim-treesitter)"*. Deleting the directory cleared all 17 errors and
      left the 317 managed parsers intact. The affected languages were `blade`, `chatito`,
      `desktop`, `gdscript`, `julia`, `nickel`, `php`, `php_only`, `powershell`, `purescript`,
      `swift`, `tcl` and `wit` — none of them languages you work in.
      Related correction: this config runs nvim-treesitter's **classic (master) branch**, not
      `main` — `require("nvim-treesitter")` exposes `setup`/`define_modules`/`statusline`.
      An earlier draft of this document said `main`.

- [x] **`bashls` is enabled but `bash-language-server` is not installed.** → installed via mason,
      resolving the *"not executable. Configuration will not be used"* warning. The other 11
      enabled configs (`biome`, `cssls`, `gopls`, `jsonls`, `lua_ls`, `oxlint`,
      `rust_analyzer`, `tailwindcss`, `tsgo`, `ty`, `yamlls`) already resolved.

- [x] **`goimports_reviser` is a broken conform entry.** → the cause was a **spelling bug**, not
      a missing binary: conform's builtin is `goimports-reviser` (hyphen), so the underscored
      name resolved to nothing and the step was silently skipped on every Go format. Fixed in
      `lsp/conform.lua`, binary installed via mason. End-to-end verified: an unformatted
      `main.go` in a module now comes back gofumpt'd with imports grouped.

- [x] **Missing formatters** → `prettier`, `prettierd`, `clang-format` all installed via mason.
      `:checkhealth conform` is now clean.

- [x] **Disable unused language providers.** → all four disabled in `plugin/options.lua`
      (`loaded_python3_provider`, `loaded_node_provider`, `loaded_perl_provider`,
      `loaded_ruby_provider` = 0), replacing the `python3_host_prog` line that pointed at a
      venv which no longer existed. The python3 provider had been erroring with *"Python
      executable can import 'pynvim' but not 'neovim'"*.

- [x] **Minor items installed.** `json2go` via `go install olexsmir.xyz/json2go/cmd/json2go@latest`
      (note: it is *not* on GitHub — the module path is a vanity domain), and LuaSnip's
      `jsregexp` built with `make install_jsregexp`.

Ignorable: the luarocks `lua 5.1` vs `5.5` warning — lazy states *"no plugins require
`luarocks`, so you can ignore any warnings below"*.

---

## Tier 3 — TypeScript: `tsgo` → `tsc` ✅ DONE

Completed August 2026, including a working `add_missing_imports` built by hand — see
"Implementing the missing code actions" at the end of this section.

### What changed

TypeScript 7.0 shipped on 2026-07-08. `npm install typescript` now installs the Go-native
compiler, and the language server is started as `tsc --lsp --stdio`
([Announcing TypeScript 7.0](https://devblogs.microsoft.com/typescript/announcing-typescript-7-0/);
`typescript@latest` on npm is `7.0.2`). The upstream repo confirms the rename: *"For
TypeScript 7.0 RC and later, the command name is `tsc`"*
([microsoft/typescript-go](https://github.com/microsoft/typescript-go)).

nvim-lspconfig followed in commit *"feat: tsc #4493"*: `lsp/tsgo.lua` is now a shim that
calls `vim.deprecate('tsgo', 'tsc', '3.0.0', …)`, and the real config lives in `lsp/tsc.lua`
([discussion](https://github.com/neovim/nvim-lspconfig/issues/4467)). TypeScript lead Ryan
Cavanaugh, in that thread: *"`tsgo` as a name is effectively gone."* You never saw the
deprecation notice because of the `vim.deprecate` stub in `init.lua`.

### Three defects in the current setup

1. **Binary resolution ignores the project.** `lua/rielj/lsp/servers/tsgo.lua` hardcodes
   `cmd = { "tsgo", "--lsp", "--stdio" }`, so you always get whatever `@typescript/native-preview`
   build is on `$PATH`, never the project's own `typescript` dependency. lspconfig's `tsc.lua`
   probes `node_modules/.bin/tsc`, `tsc`, `node_modules/.bin/tsgo`, `tsgo` in order, verifies
   `--version` reports major ≥ 7, caches the result per root, and refuses to start inside Deno
   projects.

2. **Inlay-hint settings are almost certainly ignored.** You send
   `settings.typescript.inlayHints.*`, which is the `ts_ls`/`vtsls` shape. The native server
   reads VS Code-style keys, and lspconfig's `tsc.lua` sends `settings['js/ts'].inlayHints.*`.

3. **Two of the six `tsgo-tools` keymaps cannot work.** `ge` sends `source.removeUnused` and
   `go` sends `source.addMissingImports`. In `internal/ls/codeactions.go` the supported source
   kinds are `source.organizeImports`, `source.removeUnusedImports`, `source.sortImports` and
   `source.fixAll`; a code search across `microsoft/typescript-go` returns **zero** hits for
   `addMissingImports`. Those are `tsserver`-era kinds that only `ts_ls`/`vtsls` expose. This
   is the same request family that produced the original
   `missing required properties: range` error.

### Options

| | `tsc` (TS 7 native) | `vtsls` | `ts_ls` |
|---|---|---|---|
| Status | compiler GA; LSP described upstream as *"in progress — nearly all features implemented"* | active, pushed 2026-08-17 | active, pushed 2026-08-18 |
| Speed | ~8–12× faster typecheck, native Go | Node | Node |
| Known gaps | signature help and string-literal completion bugs reported by nvim users in [lspconfig#4467](https://github.com/neovim/nvim-lspconfig/issues/4467) | none material | none material |
| Code actions | 4 source kinds + quickfix | full tsserver surface | full tsserver surface |

### Decision

Stay on the native server — you have already accepted its tradeoffs and it is where Microsoft
is heading — but migrate from `tsgo` to `tsc`. `vtsls` remains the fallback if the native
server's gaps ever bite.

- [x] Updated nvim-lspconfig (82 commits behind; the local clone predated `lsp/tsc.lua`).
- [x] Replaced `servers/tsgo.lua` with `servers/tsc.lua`, dropping the hardcoded `cmd` so
      lspconfig's resolution applies: project-local `node_modules/.bin` first, `--version`
      major >= 7 enforced, monorepo roots, Deno projects skipped.
- [x] Moved inlay-hint settings from `settings.typescript.*` to `settings['js/ts'].*`, and the
      `preferences` block with them. Verified at runtime: the client's settings table now has
      exactly one key, `js/ts`.
- [x] Rewrote `tsgo-tools.lua` as `lua/rielj/ts-tools.lua`; commands renamed `:Tsgo*` → `:Ts*`;
      client name is now `tsc`.
- [x] `ge` is an alias of `remove_unused_imports` rather than a dead `source.removeUnused`.
- [x] `go` reimplemented over `quickfix` (below) instead of the non-existent
      `source.addMissingImports`.

### Implementing the missing code actions

Rather than accept the two dead mappings, the server was probed directly (isolated
`nvim -u NONE` + `tsc --lsp --stdio` against a scratch project) to see what it really offers:

```text
codeActionProvider.codeActionKinds = {
  "quickfix", "source.organizeImports", "source.removeUnusedImports",
  "source.sortImports", "source.fixAll",
}
```

**Add missing imports — recovered.** Asking for `quickfix` over the whole buffer, with the
buffer's diagnostics in context, makes the server return one `Add import from "./lib"` per
unresolved name *plus* a batch `Add all missing imports`, each with a complete workspace edit:

```text
actions: 3
  1. kind=quickfix title="Add import from \"./lib\""  edit=yes
  2. kind=quickfix title="Add import from \"./lib\""  edit=yes
  3. kind=quickfix title="Add all missing imports"    edit=yes
```

`M.add_missing_imports` filters to those titles, prefers the batch action, and falls back to
the first single fix. Preferring the batch matters: the individual edits are all computed
against the *original* document, so applying more than one would conflict.

This needed one addition to the `rielj.lsp.action` seam: a `select` hook that runs once with
the whole filtered list, letting a caller choose among actions instead of applying all of
them. Resolution (`codeAction/resolve`) now happens after selection, so discarded candidates
are never resolved.

**Remove unused locals — genuinely impossible.** A quickfix request at a `6133`
("declared but its value is never read") diagnostic returns zero actions, and `source.fixAll`
leaves `const unusedLocal = 42` untouched. Only unused *imports* can be removed, via
`source.removeUnusedImports`. Hence `ge` aliases `gs` rather than pretending.

Incidental finding: `source.fixAll` also adds missing imports, so `gA` overlaps `go`.

### Verification

Against a scratch project with two unresolved names, one unused import and one unused local:

| Key | Result |
|---|---|
| `go` | `import { VERSION, greet } from "./lib";` inserted |
| `gs` | unused `readFileSync` import removed |
| `gS` | imports sorted, output stable |
| `gA` | applies, also adds imports |
| `gR` | `workspace/willRenameFiles` advertised by the server |

Re-run against `~/pi-scratch`, the project where this all started: `tsc` attaches at the
project root, all five actions execute, and **no `InvalidParams` / `cannot unmarshal` error
appears** — the original failure is gone.

One loose end: there is no global TypeScript 7 on `$PATH`, only a `tsgo` dev build
(`7.0.0-dev.20251005.1`). Projects with a local `typescript` dependency are unaffected, but
any project without one will fall back to that stale binary. `npm i -g typescript` fixes it.

---

## Tier 4 — Native LSP layout ✅ DONE

### Where you already are

Good news: the hard part is done. `lua/rielj/lsp/init.lua` already uses `vim.lsp.config()`
and `vim.lsp.enable()` — the native 0.11+ API — with nvim-lspconfig acting purely as the
provider of `lsp/*.lua` defaults. There is no `lspconfig.setup{}` call anywhere. That is the
recommended arrangement, not a legacy one.

The remaining work is layout, not API: replacing the `servers/init.lua` registry table plus
the `setup_server` loop with the runtimepath-based mechanism Neovim resolves on its own.

### How the native mechanism works

Neovim reads `lsp/<name>.lua` from anywhere on `'runtimepath'`, then merges configs in
increasing priority ([`:help lsp-config-merge`](https://neovim.io/doc/user/lsp.html#lsp-config-merge)):

1. the config defined for `'*'`
2. all `lsp/<name>.lua` files on the runtimepath — this is what nvim-lspconfig ships
3. all `after/lsp/<name>.lua` files — *"a standard Vim feature which allows you to override
   `lsp/*.lua` configs provided by plugins (such as nvim-lspconfig)"*
4. anything defined elsewhere, e.g. a direct `vim.lsp.config()` call

So `after/lsp/gopls.lua` is the sanctioned place for "lspconfig's gopls defaults, plus my
settings" — no merge code of your own, no registry table, no loop.

A config activates on a buffer when `filetype` matches, `buftype` is empty or `help`, and
either `root_markers`/`root_dir()` resolved or `workspace_required = false`
([`:help lsp-activate`](https://neovim.io/doc/user/lsp.html#lsp-activate)).

0.12 also gives you `:lsp-enable`, `:lsp-disable`, `:lsp-restart`, `:lsp-stop`, and
`:checkhealth vim.lsp` reports an "Enabled Configurations" section — better introspection than
the current table-driven setup provides.

### Dead line found while reviewing this

`lua/rielj/lsp/init.lua` line 15:

```lua
vim.tbl_deep_extend("force", updated_capabilities, require("cmp_nvim_lsp").default_capabilities())
```

`vim.tbl_deep_extend` returns a new table; it does not mutate its first argument, so this
return value is discarded. **It is a no-op, but harmless**: `handlers.common_capabilities()`
already calls `cmp_nvim_lsp.default_capabilities(capabilities)` internally
(`handlers.lua:130-133`), and `:checkhealth vim.lsp` confirms every enabled server receives
the cmp-shaped capabilities (`insertReplaceSupport = true`, `completionList.itemDefaults`,
`dynamicRegistration = false`). Delete the line as cleanup, not as a fix.

*(An earlier draft of this document claimed cmp capabilities never reached servers. That was
wrong — corrected after reading `handlers.lua` and the healthcheck output.)*

### Tasks

- [x] Deleted the discarded `tbl_deep_extend` line (a no-op, as established above).
- [x] Shared settings now live in one `vim.lsp.config('*', { capabilities, on_init })` call.
- [x] Per-server overrides moved from `lua/rielj/lsp/servers/<name>.lua` to
      `after/lsp/<name>.lua`; the `servers/` directory is gone.
- [x] The registry table and `setup_server` loop are replaced by a single `vim.lsp.enable({…})`
      call listing all twelve servers.
- [x] Per-server `on_attach` plumbing replaced by one `LspAttach` autocommand.
- [x] `:checkhealth vim.lsp` reports **0 errors, 0 warnings**.

### Why LspAttach rather than a `'*'` on_attach

Not a style preference. Config merge is `force`, so a per-server `on_attach` *replaces* the
`'*'` one rather than running after it. Keeping the common keymaps in `'*'` would have
silently disabled them in TypeScript buffers, where `after/lsp/tsc.lua` needs its own
`on_attach` for the ts-tools mappings. With the common wiring in an autocommand, both run.

### Two real bugs found while rewriting this

**Document highlighting never worked.** `lsp_highlight_document` gated on
`client.server_capabilities.document_highlight`, but the capability is
`documentHighlightProvider` — no server sets the snake_case key, so the `CursorHold`
autocommands were never created. Now gated on
`client:supports_method("textDocument/documentHighlight", bufnr)`, and verified: 2 autocommands
registered on a TypeScript buffer where there were previously 0.

**`rename_filter` filtered out everything.** It called `client.supports_method(...)` with a
dot, which passes the method name as `self` and throws; the surrounding `pcall` swallowed the
error and returned false for every client. Same dot-vs-colon bug that was fixed in
`tsgo-tools.lua` earlier. Fixed, and the now-pointless `pcall` and `null-ls` exclusion
(null-ls is not installed) went with it.

### Incidental cleanups

- The `sign_define("DiagnosticSignError", …)` loop was pre-0.10; `vim.diagnostic.config({
  signs = { text = … } })` in the same function already set the same glyphs.
- The `vim.lsp.with()` wrappers for hover/signatureHelp only set `border = "rounded"`, which
  `vim.o.winborder = "rounded"` in `plugin/options.lua` already applies to every float.
- `float.source = "always"` is the old string form; it is a boolean now.
- `get_common_opts()` was unreferenced, and passed `capabilities = M.common_capabilities` —
  the function, not its result.
- `jsonls` hardcoded a `cmd` identical to lspconfig's, plus a `setup.commands` table that was
  a pre-native lspconfig extension point nothing reads any more.
- `yamlls` had `completion`/`hover` keys as siblings of `yaml` rather than inside it, so they
  were ignored; `ty` and `yamlls` both carried a made-up `enable`/`enabled` field.
- `gopls` re-declared the exact `filetypes` list lspconfig already ships.

### Verification

Opened a real file per language and inspected the attached client's merged settings:

| File | Client | Merged settings key |
|---|---|---|
| `main.ts` | `tsc` | `js/ts` |
| `main.ts` | `tailwindcss` | `tailwindCSS` |
| `init.lua` | `lua_ls` | `Lua`, `hint.enable = true` |
| `main.go` | `gopls` | `gopls` |
| `package.json` | `jsonls` | `json` |
| `style.css` | `cssls` | `css`, `scss`, `less` |
| `ci.yaml` | `yamlls` | `yaml`, schemas loaded |

The `'*'` config reaches all of them (`flags.allow_incremental_sync = true`, cmp-shaped
`completionList.itemDefaults`), and `gd`/`go` are both mapped on a TypeScript buffer —
confirming the LspAttach hook and `after/lsp/tsc.lua`'s own `on_attach` coexist.

`yaml-language-server` was not actually installed — `yamlls` had been enabled and silently
failing to spawn. Installed via mason during this tier.

Keep nvim-lspconfig. Post-migration it is a data package: ~350 maintained server definitions
with correct `cmd`, `filetypes`, `root_markers` and quirk handling. Deleting it means owning
all of that by hand for no gain.

### What about native completion?

Neovim ships `vim.lsp.completion.enable(true, client.id, bufnr, { autotrigger = true })`
([`:help vim.lsp.completion`](https://neovim.io/doc/user/lsp.html#vim.lsp.completion)), which
covers LSP completion with no plugin. It does **not** cover your buffer/path/cmdline sources,
LuaSnip integration, or fuzzy matching — all of which you use.

**Recommendation: no change.** Keep `nvim-cmp`. It is still actively maintained (pushed
2026-07-09). Worth knowing native completion exists for minimal or remote configs.

### Is there a native LSP *server* installer?

No. `vim.pack` is explicitly scoped to plugins: *"Manages plugins only in a dedicated
`vim.pack` directory"* ([`:help vim.pack`](https://neovim.io/doc/user/pack.html#vim.pack)).
Nothing in core installs `gopls`, `rust-analyzer`, or `lua-language-server`.

Options, in order of preference:

1. **Keep mason** (renamed to `mason-org/mason.nvim`, per Tier 1). It works, and your usage is
   already minimal — a bare `require("mason").setup()` with `mason-lspconfig` commented out.
2. **Go system-managed**: install servers via `brew`/`go install`/`cargo install` and drop
   mason entirely. Fewer moving parts, one less `$PATH` shim layer, but you own updates.

Given you are in a dotfiles repo that presumably already has a Brewfile, option 2 is
defensible — but it is a lateral move, not an upgrade. Do it only if you want the dependency gone.

---

## Tier 5 — Lazy-loading pass ✅ DONE

Was 37 of 77 plugins loading at startup; now **5**. Headless startup **239 ms → 111 ms**.

Still eager, deliberately: `nvim-treesitter` and `tokyonight` (highlighting and colorscheme
are startup-visible), `alpha-nvim` (it *is* the startup screen), and the two telescope
extensions, which are trivial and load with telescope anyway.

| Plugin | Trigger chosen |
|---|---|
| nvim-lspconfig | `event = { "BufReadPre", "BufNewFile" }` |
| nvim-cmp + sources | `event = { "InsertEnter", "CmdlineEnter" }` |
| LuaSnip | `lazy = true` (cmp dependency) |
| supermaven-nvim | `event = "InsertEnter"` |
| nvim-autopairs | `event = "InsertEnter"` |
| telescope + fzf-native + file-browser | `event = "VeryLazy"` |
| nvim-tree.lua | `cmd = { "NvimTreeToggle", … }` + directory-argv check |
| gitsigns.nvim | `event = { "BufReadPre", "BufNewFile" }` |
| vim-fugitive / vim-rhubarb | `cmd = { "G", "Git", "Gdiffsplit", … }` / `cmd = "GBrowse"` |
| undotree | `cmd = { "UndotreeToggle", … }` + `keys = "<leader>u"` |
| Comment.nvim | `keys = { "gcc", "gbc", "gc", "gb", "gcO", "gco", "gcA" }` |
| nvim-ts-context-commentstring | `lazy = true` (Comment.nvim dependency) |
| nvim-colorizer.lua | `lazy = true` (tokyonight dependency — see below) |
| bufferline.nvim / smear-cursor / vim-surround / -repeat / -unimpaired | `event = "VeryLazy"` |
| nvim-treesitter-context | `lazy = true` (configured by the treesitter spec) |
| dim.lua | `event = "LspAttach"` |
| vim-matchup | `event = { "BufReadPost", "BufNewFile" }`, globals moved to `init` |
| vim-sleuth | `event = { "BufReadPre", "BufNewFile" }` |
| nvim-bqf | `ft = "qf"` |
| crates.nvim | `ft = "toml"` |
| gopher.nvim | `ft = { "go", "gomod", "gowork", "gotmpl" }` |
| hlslens | `keys = { "n", "N", "*", "#", "g*", "g#" }` |
| tabular / vim-abolish | `cmd = { "Tabularize", … }` / `cmd = { "Abolish", "Subvert", "S" }` |
| code-shot.nvim | `keys = { "<leader>ss" }` (visual) |
| 99 | `keys = { "<leader>9v", "<leader>9x", "<leader>9s" }` |
| fff.nvim | removed `lazy = false`; its own `keys` now trigger it |

### Three things this turned up

**`gopher.nvim` was running `:GoInstallDeps` on every startup.** Its spec had
`build = { vim.cmd([[silent! GoInstallDeps]]) }` — a *table containing the result of calling
vim.cmd*, so the command ran while the spec file was being parsed, every launch, rather than
on install. Now `build = ":GoInstallDeps"`, which lazy runs on install/update only. Its
`requires` key was a packer-ism too, silently ignored by lazy; now `dependencies`.

**`fff.nvim` had `lazy = false` *and* a `keys` table.** The former wins, so the keys were
decorative and the plugin loaded eagerly. Removing `lazy = false` makes the keys real.

**Two hidden couplings that `event` triggers would have broken.** The tokyonight config calls
`require("colorizer").setup()`, and `vim.g.matchup_*` globals are read while vim-matchup
loads. Colorizer became a tokyonight `dependency`; matchup's globals moved from `config`
(after load) to `init` (before load).

`nvim-tree` needed care as well: `hijack_netrw` only fires if the plugin is loaded when a
directory is opened, and no lazy event covers that. An `init` hook checks whether argv[0] is a
directory and force-loads in that one case.

### Verification

Loaded state inspected in a headless session, per trigger:

- at startup, with a TypeScript file: lspconfig loaded with 3 clients attached, gitsigns,
  treesitter-context and dim.lua loaded; cmp, LuaSnip, autopairs, supermaven, telescope,
  bufferline, nvim-tree and Comment.nvim all **not** loaded;
- after `doautocmd InsertEnter`: cmp (9 sources), LuaSnip, autopairs, supermaven loaded;
- after `doautocmd User VeryLazy`: telescope (with its `<space>ft` mappings installed),
  bufferline, smear-cursor, vim-surround loaded, lualine drawing a statusline;
- after `:NvimTreeToggle`: nvim-tree loaded.

## Tier 6 — Commenting ✅ DONE

Both plugins dropped. Startup is now **~80 ms**, down from 239 ms at the start of this work.

### What core actually does

Tested against a real `.tsx` file rather than trusting the release notes:

| Case | Result with zero plugins |
|---|---|
| `const x = 1;` in a `.ts` file | `// const x = 1;` |
| `<span>hi</span>` inside JSX | `{/* <span>hi</span> */}` |

The JSX case is the important one. `vim._comment.get_commentstring` resolves 'commentstring'
from treesitter capture metadata (`bo.commentstring`) and, failing that, walks the
LanguageTree to the deepest injected language containing the cursor. That is exactly what
**nvim-ts-context-commentstring** existed to provide, so it went too — the earlier plan had
kept it.

### The one real gap, and the fix

Core comments blank lines inside a range: `gc` over a block leaves a bare `//` on every empty
line. Comment.nvim's `ignore = "^$"` skipped them.

`lua/rielj/comment.lua` wraps the core operator: record which lines in the range were blank,
call `vim._comment.toggle_lines`, restore those lines to empty. Restoring afterwards rather
than excluding up front is deliberate — core decides *whether* a range is currently commented
by looking at non-blank lines only, so pre-filtering would change nothing but the edit itself.

Everything else is core's, reused rather than reimplemented: the toggle, commentstring
resolution, dot-repeat, and the `gc` textobject.

### What is gone

`gb`/`gbc` (block comments) and `gco`/`gcO`/`gcA` (comment above/below/end-of-line) have no
core equivalent and were not reimplemented.

### Verification

On a `.tsx` file, driven through real keypresses:

- `gcc` on a JSX line → `{/* … */}`;
- `gc3j` over a range containing a blank line → all non-blank lines commented, the blank one
  left empty;
- the same `gc3j` again → clean round trip, no residue;
- `.` after `gcc` → dot-repeat works, and repeating onto a blank line leaves it blank;
- `Vjgc` → visual-mode toggle works.

`:KeymapCollisions` reports none, so the three new mappings sit cleanly alongside the rest.

---

## Evaluated and rejected

Recorded so these do not get re-litigated.

**`vim.pack` instead of lazy.nvim — not yet.** Neovim 0.12 ships a built-in plugin manager:
`vim.pack.add()` / `del()` / `get()` / `update()`, the `:packupdate` command with a
review-and-confirm buffer, a lockfile (`nvim-pack-lock.json`), `PackChangedPre`/`PackChanged`
autocommands for build hooks, and `pkg.json` manifest support per
[packspec.org](https://packspec.org/). Versions can be a branch, tag, commit, or a
`vim.version.range()` semver constraint. Its own documentation carries a *"WARNING: It is
still considered experimental, yet should be stable enough for daily use"*
([`:help vim.pack`](https://neovim.io/doc/user/pack.html#vim.pack)).

The blocker is loading. `vim.pack.add()` takes a `load` option that is
`boolean|fun(plug_data)` and defaults to `false` during `init.lua` sourcing, `true`
afterwards — meaning **you hand-roll every lazy trigger yourself** with `load = false` plus
`packadd` on an autocommand. There are no declarative `event`/`ft`/`keys`/`cmd` triggers, no
dependency ordering, and no `:Lazy profile` equivalent. Since Tier 5 above is precisely a
lazy-loading exercise across 44 plugins, migrating to `vim.pack` today means writing by hand
the thing you are trying to get. Revisit when declarative loading lands. Trialling it in a
separate minimal config is cheap and reversible if you want familiarity now.

**`blink.cmp` instead of `nvim-cmp`, `snacks.picker`/`fzf-lua` instead of Telescope — no.**
Both incumbents are actively maintained (nvim-cmp pushed 2026-07-09, telescope 2026-08-17).
These are lateral moves with real migration cost. Worth knowing they exist
([awesome-neovim §Completion](https://github.com/rockerBOO/awesome-neovim#completion),
[§Fuzzy Finder](https://github.com/rockerBOO/awesome-neovim#fuzzy-finder)); not worth doing.

**`nvim-tree` and `oil.nvim` overlap — keep both.** Different jobs: persistent sidebar vs.
edit-the-filesystem-as-a-buffer. Noted only so the overlap is a decision rather than an accident.

---

## Suggested commit sequence

One commit per bullet, verifying headless startup (`nvim --headless -c 'q'`) and `:messages`
after each:

1. `chore(nvim): remove vim.deprecate stub, enable vim.loader`
2. `chore(nvim): drop impatient.nvim and popup.nvim`
3. `chore(nvim): fix renamed plugin repos`
4. `chore(nvim): unpin fidget to v2, clean stale lock entries`
5. `refactor(nvim): replace archived bufdelete`
6. `chore(nvim): drop supermaven and markdown-preview`
7. `fix(nvim): actually merge cmp_nvim_lsp capabilities`
8. `feat(nvim): migrate tsgo server config to tsc (TypeScript 7)`
9. `refactor(nvim): trim ts-tools to supported code-action kinds`
10. `refactor(nvim): move server overrides to after/lsp/`
11. `perf(nvim): lazy-load <batch>` (repeat per batch)
12. `refactor(nvim): replace Comment.nvim with core commenting`
