-- Load the SQL formatter module
local ok, sql_formatter = pcall(require, "rielj.format_sql")
if not ok then
  return
end

-- -- Auto-format SQL templates on save
-- vim.api.nvim_create_autocmd("BufWritePre", {
--   buffer = 0,
--   callback = function()
--     sql_formatter.format_sql_in_current_buffer()
--   end,
--   desc = "Format SQL template strings",
-- })
-- Register the command
vim.api.nvim_create_user_command("FormatSQLTemplates", sql_formatter.format_sql_in_current_buffer, {})

-- keymap
vim.api.nvim_set_keymap("n", "<leader>fq", "<cmd>FormatSQLTemplates<CR>", { noremap = true, silent = true })
