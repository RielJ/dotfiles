local function javascript(bufnr)
  if require("conform").get_formatter_info("biome", bufnr).available then
    return { "biome", "biome-organize-imports" }
  end
  return { "prettierd", "prettier", stop_after_first = true }
end

local function javascriptreact(bufnr)
  if require("conform").get_formatter_info("biome", bufnr).available then
    return { "biome", "biome-organize-imports", "rustywind" }
  end
  return { "prettierd", "prettier", stop_after_first = true }
end

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
    return { timeout_ms = 4000, lsp_format = "fallback" }
  end,
  formatters = {
    sql_formatter = {
      args = { "-l", "postgresql" },
    },
    biome = {
      require_cwd = true,
    },
    rustywind = {
      append_args = { "--config", "rustywind.toml" },
    },
  },
  formatters_by_ft = {
    sql = { "sql_formatter" },
    lua = { "stylua" },

    c = { "clang-format" },
    javascript = javascript,
    javascriptreact = javascriptreact,
    typescript = javascript,
    typescriptreact = javascriptreact,
    -- svelte = { "prettierd", "prettier", stop_after_first = true },
    html = { "biome", "biome-organize-imports" },
    css = { "biome", "biome-organize-imports" },
    json = { "biome", "biome-organize-imports" },
    jsonc = { "biome", "biome-organize-imports" },

    sol = { "forge_fmt" },
    solidity = { "forge_fmt" },

    go = { "gofumpt", "goimports_reviser", "golines" },
  },
})
