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
        "pmizio/typescript-tools.nvim",
        "axelvc/template-string.nvim",
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
