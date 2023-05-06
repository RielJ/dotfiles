vim.api.nvim_create_autocmd({ "FileType" }, {
  pattern = "qf",
  callback = function()
    vim.cmd.set "set nobuflisted"
  end,
})
