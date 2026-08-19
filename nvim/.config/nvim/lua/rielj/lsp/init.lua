-- LSP entry point.
--
-- Layout follows Neovim's native mechanism (`:help lsp-config`), not a
-- registry table of our own:
--
--   1. nvim-lspconfig ships `lsp/<name>.lua` on the runtimepath — cmd,
--      filetypes, root markers, per-server quirks. It is a data package now;
--      there is no `lspconfig.setup{}` call anywhere in this config.
--   2. Our overrides live in `after/lsp/<name>.lua`. Neovim merges them over
--      lspconfig's defaults automatically (`:help lsp-config-merge`), so no
--      merge code of ours is involved.
--   3. Settings shared by every server go in the `'*'` config below.
--   4. Buffer-local wiring (keymaps, highlights) happens once in an LspAttach
--      autocommand rather than per-server `on_attach` callbacks — a per-server
--      `on_attach` would otherwise be *replaced* by the `'*'` one during the
--      merge, silently dropping whichever lost.
--
-- Servers with nothing to override need no file at all; they are simply listed
-- in the enable call.

local handlers = require("rielj.lsp.handlers")

-- Diagnostic UI, LSP-buffer keymaps, document highlighting.
handlers.setup()

-- Adds mason's bin shim to $PATH, so servers installed via :Mason resolve.
-- Must run before any server starts.
require("rielj.lsp.mason").setup()

-- Applies to every server, before lspconfig's defaults and our after/lsp files.
vim.lsp.config("*", {
  capabilities = handlers.common_capabilities(),
  on_init = function(client)
    client.config.flags = client.config.flags or {}
    client.config.flags.allow_incremental_sync = true
  end,
})

vim.lsp.enable({
  "bashls",
  -- Attaches only where a biome config exists; coexists with oxlint because
  -- each resolves its own project root.
  "biome",
  "cssls",
  "gopls",
  "jsonls",
  "lua_ls",
  -- oxc's server. Attaches on `.oxlintrc.json`, resolving the project-local
  -- node_modules/.bin/oxlint. Provides :LspOxlintFixAll.
  "oxlint",
  "rust_analyzer",
  "tailwindcss",
  -- TypeScript 7 native server (`tsc --lsp`). See after/lsp/tsc.lua.
  "tsc",
  -- astral's Python type checker.
  "ty",
  "yamlls",
})

-- Formatting, for every filetype, is conform's job.
require("rielj.lsp.conform")
