-- Overrides nvim-lspconfig's `lsp/lua_ls.lua`, which supplies cmd, filetypes,
-- root markers and the lua-language-server quirks. Only the settings are ours.
---@type vim.lsp.Config
return {
  settings = {
    Lua = {
      hint = { enable = true },
      workspace = { checkThirdParty = false },
      -- Treesitter already highlights Lua; semantic tokens fight it.
      semantic = { enable = false },
      completion = { callSnippet = "Replace" },
    },
  },
}
