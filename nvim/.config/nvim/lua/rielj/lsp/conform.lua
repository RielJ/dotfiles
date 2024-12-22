require("conform").setup({
  format_on_save = function(bufnr)
    -- Disable autoformat on certain filetypes
    local ignore_filetypes = { "java" }
    if vim.tbl_contains(ignore_filetypes, vim.bo[bufnr].filetype) then
      return
    end
    -- Disable with a global or buffer-local variable
    if vim.g.disable_autoformat or vim.b[bufnr].disable_autoformat then
      return
    end
    -- Disable autoformat for files in a certain path
    local bufname = vim.api.nvim_buf_get_name(bufnr)
    if bufname:match("/node_modules/") then
      return
    end
    -- ...additional logic...
    return { timeout_ms = 4000, lsp_format = "fallback", stop_after_first = true }
  end,
  formatters = {
    sql_formatter = {
      args = { "-l", "postgresql" },
    }
  },
  formatters_by_ft = {
    sql = { "sql_formatter" },
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
})
