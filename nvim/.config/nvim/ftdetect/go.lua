vim.api.nvim_create_autocmd("BufWritePre", {
  pattern = "*.go",
  callback = function(args)
    -- Organize imports before gopls formats the buffer. Must be sync: the write
    -- happens as soon as this callback returns.
    require("rielj.lsp.action").apply({
      bufnr = args.buf,
      kind = "source.organizeImports",
      sync = true,
    })
    vim.lsp.buf.format({ async = false })
  end,
})
