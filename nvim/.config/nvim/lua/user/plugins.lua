return require("packer").startup(function(use)
  use "wbthomason/packer.nvim"
  use { "ellisonleao/gruvbox.nvim", requires = { "rktjmp/lush.nvim" } }

  -- LSP
  use "neovim/nvim-lspconfig"
  use { "antoinemadec/FixCursorHold.nvim" } -- Needed while issue https://github.com/neovim/neovim/issues/12587 is still open

  -- NvimTree
  use {
    "kyazdani42/nvim-tree.lua",
    requires = "kyazdani42/nvim-web-devicons",
    config = function()
      require("user.nvimtree").setup()
    end,
  }

  use "jose-elias-alvarez/null-ls.nvim"

  -- Telescope
  use { "nvim-lua/popup.nvim" }
  use { "nvim-lua/plenary.nvim" }
  use {
    "nvim-telescope/telescope.nvim",
    config = function()
      require("user.telescope").setup()
    end,
  }
  use {
    "nvim-telescope/telescope-fzf-native.nvim",
    run = "make",
  }
  use {
    "hrsh7th/nvim-cmp",
    config = function()
      require("user.cmp").setup()
    end,
    requires = {
      "saadparwaiz1/cmp_luasnip",
      "hrsh7th/cmp-buffer",
      "hrsh7th/cmp-nvim-lsp",
      "hrsh7th/cmp-path",
      "hrsh7th/cmp-nvim-lua",
      "hrsh7th/cmp-emoji",
    },
  }
  -- Autopairs
  use {
    "windwp/nvim-autopairs",
    -- event = "InsertEnter",
    config = function()
      require("user.autopairs").setup()
    end,
  }
  use {
    "nvim-treesitter/nvim-treesitter",
    branch = "0.5-compat",
    config = function()
      require("user.treesitter").setup()
    end,
  }
end)
