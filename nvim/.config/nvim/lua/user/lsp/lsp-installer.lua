local status_ok, lsp_installer = pcall(require, "nvim-lsp-installer")
if not status_ok then
  return
end

-- Register a handler that will be called for all installed servers.
-- Alternatively, you may also register handlers on specific server instances instead (see example below).
lsp_installer.on_server_ready(function(server)
  local opts = {
    on_attach = require("user.lsp.handlers").on_attach,
    capabilities = require("user.lsp.handlers").capabilities,
  }

  if server.name == "jsonls" then
    local jsonls_opts = require "user.lsp.settings.jsonls"
    opts = vim.tbl_deep_extend("force", jsonls_opts, opts)
  end

  if server.name == "sumneko_lua" then
    local sumneko_opts = require "user.lsp.settings.sumneko_lua"
    opts = vim.tbl_deep_extend("force", sumneko_opts, opts)
  end

  if server.name == "pyright" then
    local pyright_opts = require "user.lsp.settings.pyright"
    opts = vim.tbl_deep_extend("force", pyright_opts, opts)
  end

  if server.name == "graphql" then
    local graphql_opts = require "user.lsp.settings.graphql"
    opts = vim.tbl_deep_extend("force", graphql_opts, opts)
  end

  if server.name == "tailwindcss" then
    local tailwindcss_opts = require "user.lsp.settings.tailwindcss"
    opts = vim.tbl_deep_extend("force", tailwindcss_opts, opts)
  end

  if server.name == "vuels" then
    local vue_opts = require "user.lsp.settings.vuels"
    opts = vim.tbl_deep_extend("force", vue_opts, opts)
  end

  if server.name == "solc" then
    local solc_opts = require "user.lsp.settings.solc"
    opts = vim.tbl_deep_extend("force", solc_opts, opts)
  end

  if server.name == "solang" then
    local solang_opts = require "user.lsp.settings.solang"
    opts = vim.tbl_deep_extend("force", solang_opts, opts)
  end

  if server.name == "ccls" then
    local ccls_opts = require "user.lsp.settings.ccls"
    opts = vim.tbl_deep_extend("force", ccls_opts, opts)
  end

  if server.name == "eslint" then
    -- vim.cmd [[
    -- 		autocmd! _lsp_format_on_save
    -- 		augroup _lsp_format_on_save
    -- 			autocmd!
    -- 			autocmd BufWrite * lua require('user.lsp.handlers').format()
    -- 			autocmd BufWritePre *.tsx,*.ts,*.jsx,*.js EslintFixAll
    -- 		augroup end
    -- 	]]
    local eslint_opts = require "user.lsp.settings.eslint"
    opts = vim.tbl_deep_extend("force", eslint_opts, opts)
  end
  -- local filename = "~/.config/nvim/lua/user/lsp/settings/" .. server.name .. ".lua"
  -- if util.path.exists(filename) then
  -- 	local status, server_opts = pcall(require, "user.lsp.settings" .. server.name)
  -- 	if status then
  -- 		opts = vim.tbl_deep_extend("force", server_opts, opts)
  -- 	end
  -- end
  -- This setup() function is exactly the same as lspconfig's setup function.
  -- Refer to https://github.com/neovim/nvim-lspconfig/blob/master/doc/server_configurations.md
  server:setup(opts)
end)
