-- Per-project JS/TS toolchain detection.
-- Formatting priority: oxc (oxfmt) > biome > prettier, chosen by which
-- config file the project actually ships. Linting is handled by the matching
-- LSP server (oxlint / biome), which self-attach per project (see servers/).

-- Config-file markers used to detect each toolchain.
local OXFMT_CONFIGS = { ".oxfmtrc.json", ".oxfmtrc.jsonc", "oxfmt.config.ts" }
local BIOME_CONFIGS = { "biome.json", "biome.jsonc", ".biome.json", ".biome.jsonc" }

-- Search upward from the buffer (or cwd) for any of `markers`.
local function project_has(bufnr, markers)
  local name = vim.api.nvim_buf_get_name(bufnr)
  local start = name ~= "" and name or vim.fn.getcwd()
  return vim.fs.find(markers, { path = start, upward = true, type = "file" })[1] ~= nil
end

-- JS/TS base chain: oxc → biome → prettier.
local function js_chain(bufnr)
  if project_has(bufnr, OXFMT_CONFIGS) then
    return { "oxfmt" }
  end
  if project_has(bufnr, BIOME_CONFIGS) then
    return { "biome", "biome-organize-imports" }
  end
  return { "prettierd", "prettier", stop_after_first = true }
end

local function javascript(bufnr)
  return js_chain(bufnr)
end

-- JSX/TSX: same chain, plus Tailwind class sorting (skip in prettier fallback).
local function javascriptreact(bufnr)
  local chain = js_chain(bufnr)
  if chain.stop_after_first == nil then
    table.insert(chain, "rustywind")
  end
  return chain
end

-- css / json / html: oxfmt doesn't format these yet, so biome → prettier.
local function biome_or_prettier(bufnr)
  if project_has(bufnr, BIOME_CONFIGS) then
    return { "biome", "biome-organize-imports" }
  end
  return { "prettierd", "prettier", stop_after_first = true }
end

-- Filetype-specific work that must happen before the formatters run.
-- gopls' organizeImports adds missing imports, which goimports_reviser can't do.
local function pre_format(bufnr)
  if vim.bo[bufnr].filetype == "go" then
    require("rielj.lsp.action").apply({
      bufnr = bufnr,
      kind = "source.organizeImports",
      sync = true,
    })
  end
end

-- conform calls this per run with the buffer's directory.
local function ruff_command(_, ctx)
  return require("rielj.lsp.venv_bin").resolve("ruff", ctx.dirname)
end

local conform = require("conform")

conform.setup({
  -- The only BufWritePre formatter in this config. Anything that wants to run on
  -- save belongs in this gate, so that the exclusions below actually hold.
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
    pre_format(bufnr)
    return { timeout_ms = 4000, lsp_format = "fallback" }
  end,
  formatters = {
    sql_formatter = {
      args = { "-l", "postgresql" },
    },
    biome = {
      require_cwd = true,
    },
    oxfmt = {
      require_cwd = true,
    },
    rustywind = {
      append_args = { "--config", "rustywind.toml" },
    },
    -- Same pinned ruff as the LSP and `make lint`. See rielj/lsp/venv_bin.lua.
    ruff_fix = { command = ruff_command },
    ruff_format = { command = ruff_command },
    ruff_organize_imports = { command = ruff_command },
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
    html = biome_or_prettier,
    css = biome_or_prettier,
    json = biome_or_prettier,
    jsonc = biome_or_prettier,

    sol = { "forge_fmt" },
    solidity = { "forge_fmt" },

    -- conform's builtin is spelled with a hyphen; "goimports_reviser" silently
    -- resolved to nothing and the step was skipped.
    go = { "gofumpt", "goimports-reviser", "golines" },

    python = { "ruff_fix", "ruff_format", "ruff_organize_imports" },
  },
})

-- :Format [range] — the manual entry point, same implementation as on-save.
vim.api.nvim_create_user_command("Format", function(args)
  local range = nil
  if args.count ~= -1 then
    local end_line = vim.api.nvim_buf_get_lines(0, args.line2 - 1, args.line2, true)[1]
    range = {
      start = { args.line1, 0 },
      ["end"] = { args.line2, end_line:len() },
    }
  end
  if not range then
    pre_format(vim.api.nvim_get_current_buf())
  end
  conform.format({ range = range, lsp_format = "fallback", timeout_ms = 4000 })
end, { range = true, desc = "Format buffer or range" })
