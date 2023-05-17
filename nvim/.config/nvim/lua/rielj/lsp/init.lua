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

local servers = {
  -- Also uses `shellcheck` and `explainshell`
  bashls = true,
  eslint = {
    root_dir = lspconfig.util.root_pattern("package.json", ".git", ".eslintrc*"),
    on_attach = function(_, bufnr)
      vim.api.nvim_create_autocmd("BufWritePre", {
        buffer = bufnr,
        command = "EslintFixAll",
      })
    end,
  },
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
  cmake = (1 == vim.fn.executable("cmake-language-server")),
  cssls = true,
  tailwindcss = {
    cmd = { "tailwindcss-language-server", "--stdio" },
    settings = {
      tailwindCSS = {
        experimental = {
          classRegex = {
            {
              "clsx\\(.*\\)",
              "(?:'|\"|`)([^']*)(?:'|\"|`)",
            },
          },
        },
      },
    },
  },
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
