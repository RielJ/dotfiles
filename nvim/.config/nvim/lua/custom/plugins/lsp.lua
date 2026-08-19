return {
  {
    {
      "neovim/nvim-lspconfig",
      dependencies = {
        "nvim-lua/plenary.nvim",
        "b0o/schemastore.nvim",
        "williamboman/mason.nvim",
        -- "williamboman/mason-lspconfig.nvim",
        {
          "j-hui/fidget.nvim",
          tag = "legacy",
          event = "LspAttach",
          opts = {
            -- options
          },
        },
        "stevearc/conform.nvim",
        -- "pmizio/typescript-tools.nvim", -- replaced by tsgo + tsgo-tools
        {
          "axelvc/template-string.nvim",
          config = function()
            require("template-string").setup({
              filetypes = { "typescript", "javascript", "typescriptreact", "javascriptreact", "python" }, -- filetypes where the plugin is active
              jsx_brackets = true, -- must add brackets to jsx attributes
              remove_template_string = false, -- remove backticks when there are no template string
              restore_quotes = {
                -- quotes used when "remove_template_string" option is enabled
                normal = [[']],
                jsx = [["]],
              },
            })
          end,
        },
      },
      config = function()
        require("rielj.lsp")
        -- require("conform").setup()
      end,
    }, -- enable LSP,

    -- {
    --   "WhoIsSethDaniel/mason-tool-installer.nvim",
    --   config = function()
    --     require("mason-tool-installer").setup({
    --       auto_update = true,
    --       debounce_hours = 24,
    --       ensure_installed = {
    --         "black",
    --         "isort",
    --       },
    --     })
    --   end,
    -- },
    {
      "mbbill/undotree",
      config = function()
        vim.keymap.set("n", "<leader>u", vim.cmd.UndotreeToggle)
      end,
    },
  },
}
