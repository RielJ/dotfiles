vim.api.nvim_create_autocmd({ "TextYankPost" }, {
  pattern = "*",
  callback = function()
    vim.cmd.set "silent!lua require('vim.highlight').on_yank({higroup = 'Search', timeout = 200}) "
  end,
})
