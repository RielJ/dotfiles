-- Schemas from b0o/schemastore.nvim. cmd/filetypes/root markers come from
-- nvim-lspconfig's `lsp/jsonls.lua`.
--
-- The old copy of this config hardcoded `cmd` (identical to the default) and
-- carried a `setup.commands` table -- a pre-native lspconfig extension point
-- that nothing reads any more. Both are gone.
---@type vim.lsp.Config
return {
  settings = {
    json = {
      schemas = require("schemastore").json.schemas(),
      validate = { enable = true },
    },
  },
}
