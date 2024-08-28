local _, lspconfig = pcall(require, "lspconfig")

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

return rust_analyzer
