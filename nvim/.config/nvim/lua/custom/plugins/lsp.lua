return {
  {
    {
      "neovim/nvim-lspconfig",
      config = function()
        require("rielj.lsp")
      end,
      -- Additional lua configuration, makes nvim stuff amazing!
      -- 'folke/neodev.nvim',
    }, -- enable LSP,
    "williamboman/mason.nvim",
    "williamboman/mason-lspconfig.nvim",
    { "j-hui/fidget.nvim", opts = {} },
    "folke/neodev.nvim",
    "nvim-lua/lsp-status.nvim",
    "jose-elias-alvarez/null-ls.nvim",
    "jose-elias-alvarez/nvim-lsp-ts-utils",
    {
      "jose-elias-alvarez/typescript.nvim",
      ft = {
        "javascript",
        "javascriptreact",
        "javascript.jsx",
        "typescript",
        "typescriptreact",
        "typescript.tsx",
      },
      event = { "BufReadPre", "BufNew" },
      config = function()
        require("rielj.typescript").config()
      end,
      dependencies = "williamboman/mason.nvim",
    },
    "onsails/lspkind-nvim",

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
      config = function()
        local _, sig = pcall(require, "lsp_signature")
        sig.setup({
          bind = true,
          doc_lines = 10,
          floating_window = false, -- show hint in a floating window, set to false for virtual text only mode
          floating_window_above_cur_line = true,
          fix_pos = false, -- set to true, the floating window will not auto-close until finish all parameters
          hint_enable = true, -- virtual hint enable
          -- hint_prefix = "🐼 ", -- Panda for parameter
          hint_prefix = " ",
          hint_scheme = "String",
          -- use_lspsaga = false, -- set to true if you want to use lspsaga popup
          hi_parameter = "Search", -- how your parameter will be highlight
          max_height = 12, -- max height of signature floating_window, if content is more than max_height, you can scroll down
          -- to view the hiding contents
          max_width = 120, -- max_width of signature floating_window, line will be wrapped if exceed max_width
          handler_opts = {
            border = "single", -- double, single, shadow, none
          },
          -- transpancy = 80,
          -- extra_trigger_chars = { "(", "," }, -- Array of extra characters that will trigger signature completion, e.g., {"(", ","}
          zindex = 200, -- by default it will be on top of all floating windows, set to 50 send it to bottom
          debug = false, -- set to true to enable debug logging
          log_path = "debug_log_file_path", -- debug log path
          padding = "", -- character to pad on left and right of signature can be ' ', or '|'  etc
          shadow_blend = 36, -- if you using shadow as border use this set the opacity
          shadow_guibg = "Black", -- if you using shadow as border use this set the color e.g. 'Green' or '#121315'
        })
      end,
      event = { "BufRead", "BufNew" },
    },
    {
      "kosayoda/nvim-lightbulb",
      config = function()
        vim.fn.sign_define("LightBulbSign", { text = "", texthl = "DiagnosticInfo" })
      end,
      event = "BufRead",
      ft = { "rust", "go", "typescript", "typescriptreact" },
    },
  },
}
