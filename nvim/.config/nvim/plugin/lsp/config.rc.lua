local ok, lspconfig = pcall(require, "lspconfig")
if not ok then
  return
end

local util = require "lspconfig.util"

util.on_setup = util.add_hook_after(util.on_setup, function(config)
  if config.on_attach then
    config.on_attach = util.add_hook_after(config.on_attach, require("user.lsp.handlers").on_attach)
  else
    config.on_attach = require("user.lsp.handlers").on_attach
  end
  config.capabilities = require("user.lsp.handlers").common_capabilities
end)

require("mason-lspconfig").setup {}

require("mason-lspconfig").setup_handlers {
  function(server_name)
    if server_name ~= "tsserver" then
      lspconfig[server_name].setup {}
    end
  end,
  ["jsonls"] = function()
    local jsonls_opts = require "user.lsp.settings.jsonls"
    lspconfig.jsonls.setup(jsonls_opts)
  end,
  ["sumneko_lua"] = function()
    local sumneko_lua_opts = require "user.lsp.settings.sumneko_lua"
    lspconfig.sumneko_lua.setup(sumneko_lua_opts)
  end,
  ["pyright"] = function()
    local pyright_opts = require "user.lsp.settings.pyright"
    lspconfig.pyright.setup(pyright_opts)
  end,
  ["graphql"] = function()
    local graphql_opts = require "user.lsp.settings.graphql"
    lspconfig.graphql.setup(graphql_opts)
  end,
  ["tailwindcss"] = function()
    local tailwindcss_opts = require "user.lsp.settings.tailwindcss"
    lspconfig.tailwindcss.setup(tailwindcss_opts)
  end,
  ["vuels"] = function()
    local vuels_opts = require "user.lsp.settings.vuels"
    lspconfig.vuels.setup(vuels_opts)
  end,
  ["solc"] = function()
    local solc_opts = require "user.lsp.settings.solc"
    lspconfig.solc.setup(solc_opts)
  end,
  ["solang"] = function()
    local solang_opts = require "user.lsp.settings.solang"
    lspconfig.solang.setup(solang_opts)
  end,
  ["tsserver"] = function()
    require("user.tss").config()
  end,
  -- ["ccls"] = function()
  --   local ccls_opts = require "user.lsp.settings.ccls"
  --   lspconfig.ccls.setup(ccls_opts)
  -- end,
  ["eslint"] = function()
    -- vim.cmd [[
    -- 		autocmd! _lsp_format_on_save
    -- 		augroup _lsp_format_on_save
    -- 			autocmd!
    -- 			autocmd BufWrite * lua require('user.lsp.handlers').format()
    -- 			autocmd BufWritePre *.tsx,*.ts,*.jsx,*.js EslintFixAll
    -- 		augroup end
    -- 	]]
    local eslint_opts = require "user.lsp.settings.eslint"
    lspconfig.eslint.setup(eslint_opts)
  end,
}
