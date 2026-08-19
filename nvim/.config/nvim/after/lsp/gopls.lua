-- cmd, filetypes and root markers come from nvim-lspconfig's `lsp/gopls.lua`
-- (its filetypes list is already go/gomod/gowork/gotmpl, so the old copy here
-- was redundant).
---@type vim.lsp.Config
return {
  settings = {
    gopls = {
      codelenses = { test = true },
      hints = {
        assignVariableTypes = true,
        compositeLiteralFields = true,
        compositeLiteralTypes = true,
        constantValues = true,
        functionTypeParameters = true,
        parameterNames = true,
        rangeVariableTypes = true,
      },
    },
  },
  flags = {
    debounce_text_changes = 200,
  },
}
