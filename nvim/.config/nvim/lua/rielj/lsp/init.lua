local _, neodev = pcall(require, "neodev")
if neodev then
  neodev.setup {
    override = function(_, library)
      library.enabled = true
      library.plugins = true
    end,
  }
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

local servers = {
  -- Also uses `shellcheck` and `explainshell`
  bashls = true,
  eslint = true,
  graphql = {
    cmd = { "graphql-lsp", "server", "-m", "stream" },
    filetypes = {
      "graphql",
      "typescriptreact",
      "javascriptreact",
    },
  },
  html = true,
  pyright = true,
  vimls = true,
  cmake = (1 == vim.fn.executable "cmake-language-server"),
  cssls = true,
  tailwindcss = {
    cmd = { "tailwindcss-language-server", "--stdio" },
  },
  -- tsserver = {
  --   init_options = ts_util.init_options,
  --   cmd = { "typescript-language-server", "--stdio" },
  --   filetypes = {
  --     "javascript",
  --     "javascriptreact",
  --     "javascript.jsx",
  --     "typescript",
  --     "typescriptreact",
  --     "typescript.tsx",
  --   },
  --   on_attach = function(client)
  --     custom_attach(client)

  --     ts_util.setup { auto_inlay_hints = false }
  --     ts_util.setup_client(client)
  --   end,
  -- },
}

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

require("lspconfig").lua_ls.setup {
  on_init = custom_init,
  on_attach = custom_attach,
  capabilities = updated_capabilities,
  settings = {
    Lua = { workspace = { checkThirdParty = false }, semantic = { enable = false } },
  },
}

for server, config in pairs(servers) do
  setup_server(server, config)
end

-- NULL LS
require("rielj.lsp.null-ls").setup()

return {
  on_init = custom_init,
  on_attach = custom_attach,
  capabilities = updated_capabilities,
}
