return {
  on_attach = function(_, bufnr)
    vim.api.nvim_create_autocmd("BufWritePre", {
      buffer = bufnr,
      command = "EslintFixAll",
    })
  end,
  settings = {
    experimental = {
      useFlatConfig = true
    },
    validate = { "svelte", "javascript", "typescript", "javascriptreact", "typescriptreact" },
  },
}
