vim.api.nvim_create_autocmd({ "BufWritePre" }, {
  pattern = "*",
  callback = function()
    vim.cmd("lua require('rielj.lsp.handlers').format()")
  end,
})
