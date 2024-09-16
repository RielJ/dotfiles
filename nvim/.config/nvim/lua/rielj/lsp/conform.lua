require("conform").setup({
  formatters_by_ft = {
    lua = { "stylua" },

    -- Conform will run the first available formatter
    javascript = { "prettierd", "prettier", stop_after_first = true },
    typescript = { "prettierd", "prettier", stop_after_first = true },
    -- svelte = { "prettierd", "prettier", stop_after_first = true },
    html = { "prettierd", "prettier", stop_after_first = true },
    css = { "prettierd", "prettier", stop_after_first = true },
    json = { "prettierd", "prettier", stop_after_first = true },


    go = { "gofumpt", "goimports_reviser", "golines" },
  },

  -- enable format on save
  format_on_save = {
    -- These options will be passed to conform.format()
    timeout_ms = 4000,
    lsp_format = "fallback"
  },
})
