require("conform").setup({
  formatters_by_ft = {
    lua = { "stylua" },

    c = { "clang-format" },
    -- Conform will run the first available formatter
    javascript = { "biome", "prettierd", "prettier", stop_after_first = true },
    javascriptreact = { "biome", "prettierd", "prettier", stop_after_first = true },
    typescript = { "biome", "prettierd", "prettier", stop_after_first = true },
    typescriptreact = { "biome", "prettierd", "prettier", stop_after_first = true },
    -- svelte = { "prettierd", "prettier", stop_after_first = true },
    html = { "prettierd", "prettier", stop_after_first = true },
    css = { "prettierd", "prettier", stop_after_first = true },
    json = { "prettierd", "prettier", stop_after_first = true },

    sol = { "forge_fmt" },
    solidity = { "forge_fmt" },


    go = { "gofumpt", "goimports_reviser", "golines" },
  },

  -- enable format on save
  format_on_save = {
    -- These options will be passed to conform.format()
    timeout_ms = 4000,
    stop_after_first = true,
    lsp_format = "fallback"
  },
})
