vim.api.nvim_create_autocmd({ "FileType" }, {
  pattern = { "qf", "help", "man", "lspinfo" },
  callback = function()
    vim.cmd.set "nnoremap <silent> <buffer> q :close<CR>"
  end,
})
vim.api.nvim_create_autocmd({ "BufWinEnter" }, {
  pattern = "*",
  callback = function()
    vim.cmd.set ":set formatoptions-=cro"
  end,
})
