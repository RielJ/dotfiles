vim.api.nvim_create_autocmd({ "CursorHold", "CursorHoldI" }, {
  pattern = { "*.rs", "*.go", "*.ts", "*.tsx" },
  callback = function()
    vim.cmd("lua require('rielj.codelens').show_line_sign()")
  end,
})
