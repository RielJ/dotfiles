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

local rust_analyzer, rust_analyzer_cmd = nil, { "rustup", "run", "stable", "rust-analyzer" }
local has_rt, rt = pcall(require, "rust-tools")
if has_rt then
  -- TODO: Implement DAP
  -- local extension_path = vim.fn.expand("~/.vscode/extensions/sadge-vscode/extension/")
  -- local codelldb_path = extension_path .. "adapter/codelldb"
  -- local liblldb_path = extension_path .. "lldb/lib/liblldb.so"

  rt.setup({
    server = {
      cmd = rust_analyzer_cmd,
      capabilities = updated_capabilities,
      on_attach = function(client, bufnr)
        -- TODO: Implement Hover Actions and Code Action Groups
        custom_attach(client, bufnr)
        -- Hover actions
        -- vim.keymap.set("n", "<C-space>", rt.hover_actions.hover_actions, { buffer = bufnr })
        -- Code action groups
        -- vim.keymap.set("n", "<Leader>a", rt.code_action_group.code_action_group, { buffer = bufnr })
        vim.keymap.set("n", "K", function()
          -- _G.X.help_float = 1
          rt.hover_actions.hover_actions()
        end, { buffer = bufnr })
        vim.keymap.set("n", "ga", rt.code_action_group.code_action_group, { buffer = bufnr })

        vim.api.nvim_create_autocmd("BufWritePre", {
          buffer = bufnr,
          callback = function()
            vim.lsp.buf.format({ name = "rust_analyzer" })
          end,
          desc = "Auto format on save for rust codes",
        })
      end,
      handlers = {
        ["textDocument/publishDiagnostics"] = vim.lsp.with(vim.lsp.diagnostic.on_publish_diagnostics, {
          virtual_text = {
            prefix = "",
            spacing = 0,
            format = function(diag)
              if diag.severity == vim.diagnostic.severity.ERROR then
                return diag.message
              end
              return ""
            end,
          },
          signs = {
            severity = { min = vim.diagnostic.severity.WARNING },
          },
          underline = {
            severity = { min = vim.diagnostic.severity.ERROR },
          },

        }),
      },
    },
    settings = {
      ["rust-analyzer"] = {
        diagnostics = {
          enable = true,
        },
        checkOnSave = {
          command = "clippy",
        },
        cargo = {
          allFeatures = true,
        },
      },
    },
    -- dap = {
    --   adapter = require("rust-tools.dap").get_codelldb_adapter(codelldb_path, liblldb_path),
    -- },
    tools = {
      inlay_hints = {
        auto = true,
      },
    },
  })
else
  rust_analyzer = {
    cmd = rust_analyzer_cmd,
    settings = {
      ["rust-analyzer"] = {
        checkOnSave = {
          command = "clippy",
        },
        diagnostics = {
          enable = true,
        },
        cargo = {
          allFeatures = true,
        },
      },
    },
    root_dir = lspconfig.util.root_pattern("Cargo.toml"),
    filetypes = { "rust" },
  }
end

local servers = {
  -- Also uses `shellcheck` and `explainshell`
  -- angularls = true,
  bashls = true,
  bufls = true,

  -- eslint = {
  --   enable = false,
  --   root_dir = lspconfig.util.root_pattern(".eslintrc*"),
  --   on_attach = function(_, bufnr)
  --     vim.api.nvim_create_autocmd("BufWritePre", {
  --       buffer = bufnr,
  --       command = "EslintFixAll",
  --     })
  --   end,
  -- },
  graphql = {
    cmd = { "graphql-lsp", "server", "-m", "stream" },
    filetypes = {
      "graphql",
      "typescriptreact",
      "javascriptreact",
    },
  },
  rust_analyzer = rust_analyzer,
  templ = true,
  gopls = {
    root_dir = function(fname)
      local Path = require "plenary.path"

      local absolute_cwd = Path:new(vim.loop.cwd()):absolute()
      local absolute_fname = Path:new(fname):absolute()

      if string.find(absolute_cwd, "/cmd/", 1, true) and string.find(absolute_fname, absolute_cwd, 1, true) then
        return absolute_cwd
      end

      return lspconfig.util.root_pattern("go.mod", ".git")(fname)
    end,

    settings = {
      gopls = {
        codelenses = { test = true },
        hints = {
          assignVariableTypes = true,
          compositeLiteralFields = true,
          compositeLiteralTypes = true,
          constantValues = true,
          functionTypeParameters = true,
          parameterNames = true,
          rangeVariableTypes = true,
        },
      },
    },

    flags = {
      debounce_text_changes = 200,
    },
    filetypes = { "go", "gomod", "gowork", "gotmpl" },
  },
  html = {
    settings = {
      html = {
        suggest = {
          html5 = true,
        },
      },
    },
    filetypes = { "html", "templ" },
  },
  htmx = {
    settings = {
      html = {
        suggest = {
          html5 = true,
        },
      },
    },
    filetypes = { "html", "templ" },
  },
  dockerls = true,
  yamlls = true,
  pyright = true,
  prismals = true,
  vimls = true,
  cmake = (1 == vim.fn.executable("cmake-language-server")),
  cssls = {
    settings = {
      css = {
        validate = true,
        lint = {
          unknownAtRules = "ignore",
        },
      },
      scss = {
        validate = true,
        lint = {
          unknownAtRules = "ignore",
        },
      },
      less = {
        validate = true,
        lint = {
          unknownAtRules = "ignore",
        },
      },
    },
  },
  -- sqls = true,
  tailwindcss = {
    root_dir = lspconfig.util.root_pattern({ "tailwind.config.js", "tailwind.config.ts" }),
    cmd = { "tailwindcss-language-server", "--stdio" },
    settings = {
      tailwindCSS = {
        experimental = {
          classRegex = {
            {
              "clsx\\(([^)]*)\\)",
              "(?:'|\"|`)([^']*)(?:'|\"|`)",
            },
            {
              "cva\\(([^)]*)\\)",
              "(?:'|\"|`)([^']*)(?:'|\"|`)", --[[ "[\"'`]([^\"'`]*).*?[\"'`]"  ]]
            },
            {
              "cn\\(([^)]*)\\)",
              "(?:'|\"|`)([^']*)(?:'|\"|`)", --[[ "[\"'`]([^\"'`]*).*?[\"'`]"  ]]
            },
          },
        },
      },
    },
  },
  jsonls = {
    cmd = {
      "vscode-json-languageserver",
      "--stdio",
    },
    settings = {
      json = {
        schemas = require("schemastore").json.schemas(),
      },
    },
    setup = {
      commands = {
        Format = {
          function()
            vim.lsp.buf.range_formatting({}, { 0, 0 }, { vim.fn.line("$"), 0 })
          end,
        },
      },
    },
  },
  -- solang = true,
  -- solc = {
  --   cmd = { "solc", "--lsp" },
  -- },
  solidity_ls_nomicfoundation = true,
  -- solidity = {
  --   settings = {
  --     -- example of global remapping
  --     solidity = { includePath = "lib", remapping = { ["@OpenZeppelin/"] = "OpenZeppelin/openzeppelin-contracts@4.6.0/" } },
  --   },
  --   cmd = { "solidity-ls", "--stdio" }

  -- },
  tflint = true,
  terraformls = true,
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
