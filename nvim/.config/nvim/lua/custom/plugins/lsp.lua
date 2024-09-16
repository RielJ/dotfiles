return {
  {
    {
      "neovim/nvim-lspconfig",
      config = function()
        require("rielj.lsp")
        -- require("lsp_lines").setup()
        -- vim.diagnostic.config { virtual_text = true, virtual_lines = false }

        -- vim.keymap.set("", "<leader>l", function()
        --   local config = vim.diagnostic.config() or {}
        --   if config.virtual_text then
        --     vim.diagnostic.config { virtual_text = false, virtual_lines = true }
        --   else
        --     vim.diagnostic.config { virtual_text = true, virtual_lines = false }
        --   end
        -- end, { desc = "Toggle lsp_lines" })
      end,
      dependencies = {
        -- { "https://git.sr.ht/~whynothugo/lsp_lines.nvim" },
      }
      -- Additional lua configuration, makes nvim stuff amazing!
      -- 'folke/neodev.nvim',
    }, -- enable LSP,
    "b0o/schemastore.nvim",
    "williamboman/mason.nvim",
    "williamboman/mason-lspconfig.nvim",
    -- {
    --   "linrongbin16/lsp-progress.nvim",
    --   requires = { "nvim-tree/nvim-web-devicons" },
    --   config = function()
    --     require("lsp-progress").setup({})
    --   end,
    -- },
    {
      "j-hui/fidget.nvim",
      tag = "legacy",
      event = "LspAttach",
      opts = {
        -- options
      },
    },
    { "folke/neodev.nvim",               opts = {} },
    -- "nvim-lua/lsp-status.nvim",
    -- "nvimtools/none-ls.nvim",
    {
      'stevearc/conform.nvim',
      opts = {},
    },
    {
      "pmizio/typescript-tools.nvim",
      ft = {
        "javascript",
        "javascriptreact",
        "javascript.jsx",
        "typescript",
        "typescriptreact",
        "typescript.tsx",
        "svelte"
      },
      -- event = { "BufReadPre", "BufNew" },
      dependencies = { "nvim-lua/plenary.nvim", "neovim/nvim-lspconfig" },
    },
    -- {
    --   "jose-elias-alvarez/typescript.nvim",
    --   ft = {
    --     "javascript",
    --     "javascriptreact",
    --     "javascript.jsx",
    --     "typescript",
    --     "typescriptreact",
    --     "typescript.tsx",
    --   },
    --   event = { "BufReadPre", "BufNew" },
    --   dependencies = "williamboman/mason.nvim",
    -- },
    "axelvc/template-string.nvim",
    -- "onsails/lspkind-nvim",
    -- "simrat39/inlay-hints.nvim",

    {
      "WhoIsSethDaniel/mason-tool-installer.nvim",
      config = function()
        require("mason-tool-installer").setup({
          auto_update = true,
          debounce_hours = 24,
          ensure_installed = {
            "black",
            "isort",
          },
        })
      end,
    },

    -- XML Attributes
    { "whatyouhide/vim-textobj-xmlattr", dependencies = { "kana/vim-textobj-user" } },

    {
      "folke/lsp-trouble.nvim",
      cmd = "Trouble",
      config = function()
        -- Can use P to toggle auto movement
        require("trouble").setup({
          auto_preview = false,
          auto_fold = true,
        })
      end,
    },
    {
      "ray-x/lsp_signature.nvim",
      event = { "BufRead", "BufNew" },
    },
    {
      "kosayoda/nvim-lightbulb",
      event = "BufRead",
      ft = { "rust", "go", "typescript", "typescriptreact" },
    },
    { "mbbill/undotree" },
  },
}
