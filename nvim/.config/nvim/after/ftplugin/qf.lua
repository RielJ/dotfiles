-- vim.api.nvim_create_autocmd({ "FileTypeQF" }, {
--   pattern = "qf",
--   callback = function()
vim.cmd.set("nobuflisted")
vim.keymap.set("n", "q", "<cmd>close<cr>", { buffer = true })
--   end,
-- })
