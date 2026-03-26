-- Disable LSP semantic token for strings in Python
-- so that treesitter SQL injection highlights are visible
-- (LSP semantic tokens have priority 125, overriding treesitter injection at 100)
vim.api.nvim_set_hl(0, "@lsp.type.string.python", {})
