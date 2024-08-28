local _, neodev = pcall(require, "neodev")
if neodev then
  neodev.setup({})
end

local _, lspconfig = pcall(require, "lspconfig")

-- LSP SETUP
require("rielj.lsp.handlers").setup()
local custom_init = function(client)
  client.config.flags = client.config.flags or {}
  client.config.flags.allow_incremental_sync = true
end
local updated_capabilities = require("rielj.lsp.handlers").common_capabilities()
local custom_attach = require("rielj.lsp.handlers").common_on_attach

vim.tbl_deep_extend("force", updated_capabilities, require("cmp_nvim_lsp").default_capabilities())

local servers = require("rielj.lsp.servers")

-- MASON
require("rielj.lsp.mason").setup()

-- SETUP SERVERS
local setup_server = function(server, config)
  if not config then
    return
  end

  if type(config) ~= "table" then
    config = {}
  end

  config = vim.tbl_deep_extend("force", {
    on_init = custom_init,
    on_attach = custom_attach,
    capabilities = updated_capabilities,
    flags = {
      debounce_text_changes = nil,
    },
  }, config)

  lspconfig[server].setup(config)
end

require("lspconfig").lua_ls.setup({
  on_init = custom_init,
  on_attach = custom_attach,
  capabilities = updated_capabilities,
  settings = {
    Lua = {
      workspace = { checkThirdParty = false },
      semantic = { enable = false },
      completion = { callSnippet = "Replace" },
    },
  },
})

require("rielj.typescript")

for server, config in pairs(servers) do
  setup_server(server, config)
end

-- CONFORM
require("rielj.lsp.conform")

return {
  on_init = custom_init,
  on_attach = custom_attach,
  capabilities = updated_capabilities,
}
