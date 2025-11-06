local M = {}

M.setup = function()
  require("mason").setup()
  -- require("mason-lspconfig").setup {
  --   ensure_installed = { "lua_ls" },
  -- }
end

return M
