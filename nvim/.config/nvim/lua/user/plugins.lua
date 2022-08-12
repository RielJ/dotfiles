require("user.plugin-loader").setup()
return require("packer").startup(function(use)
  use "wbthomason/packer.nvim"

  use "lewis6991/impatient.nvim"

  -- Colorscheme
  use { "ellisonleao/gruvbox.nvim", requires = { "rktjmp/lush.nvim" } }
  use "bluz71/vim-nightfly-guicolors"
  use "sainnhe/gruvbox-material"
  use "glepnir/zephyr-nvim"

  -- LSP
  use "neovim/nvim-lspconfig" -- enable LSP
  use "j-hui/fidget.nvim"
  use "williamboman/mason.nvim"
  use "williamboman/mason-lspconfig.nvim"
  use {
    "antoinemadec/FixCursorHold.nvim",
    run = function()
      vim.g.curshold_updatime = 1000
    end,
  } -- Needed while issue https://github.com/neovim/neovim/issues/12587 is still open
  use "onsails/lspkind-nvim"
  use "jose-elias-alvarez/null-ls.nvim"
  use "jose-elias-alvarez/typescript.nvim"

  -- use {
  --   "folke/lsp-trouble.nvim",
  --   cmd = "Trouble",
  -- }
  use "AckslD/nvim-neoclip.lua"

  use {
    "windwp/nvim-ts-autotag",
    ft = { "typescript", "typescriptreact", "vue" },
  } -- automatically close jsx tags
  use {
    "ray-x/lsp_signature.nvim",
    event = { "BufRead", "BufNew" },
  }
  use {
    "kosayoda/nvim-lightbulb",
    event = "BufRead",
    ft = { "rust", "go", "typescript", "typescriptreact" },
  }

  -- Terminal
  use "akinsho/toggleterm.nvim"

  -- XML Attributes
  use { "whatyouhide/vim-textobj-xmlattr", requires = { "kana/vim-textobj-user" } }

  -- log highlighter
  use { "mtdl9/vim-log-highlighting", ft = { "text", "log" } }

  -- Spectre
  use {
    "windwp/nvim-spectre",
    event = "BufRead",
  }

  -- hlslens
  use {
    "kevinhwang91/nvim-hlslens",
    event = "BufReadPost",
  }

  -- Matchup
  use {
    "andymass/vim-matchup",
    event = "BufReadPost",
  }

  -- Cheatsheet
  use {
    "RishabhRD/nvim-cheat.sh",
    requires = "RishabhRD/popfix",
    opt = true,
    cmd = { "Cheat", "CheatWithoutComments", "CheatList", "CheatListWithoutComments" },
    keys = "<leader>?",
  }

  -- Colorizer
  use {
    "norcalli/nvim-colorizer.lua",
    opt = true,
    event = "BufRead",
  }

  -- Comment
  use {
    "numToStr/Comment.nvim",
    requires = { "JoosepAlviste/nvim-ts-context-commentstring" },
  }
  use {
    "JoosepAlviste/nvim-ts-context-commentstring",
    event = "BufReadPost",
  }
  use {
    "folke/todo-comments.nvim",
    requires = "nvim-lua/plenary.nvim",
    event = "BufRead",
  }

  -- Dashboard
  use "goolord/alpha-nvim"

  -- NvimTree
  use {
    "kyazdani42/nvim-tree.lua",
    requires = "kyazdani42/nvim-web-devicons",
  }

  -- Telescope
  use "nvim-lua/popup.nvim"
  use "nvim-lua/plenary.nvim"
  use "nvim-telescope/telescope.nvim"
  use {
    "nvim-telescope/telescope-fzf-native.nvim",
    run = "make",
  }

  -- Completion
  use {
    "hrsh7th/nvim-cmp",
    requires = {
      "saadparwaiz1/cmp_luasnip",
      "hrsh7th/cmp-buffer",
      "hrsh7th/cmp-nvim-lsp",
      "hrsh7th/cmp-path",
      "hrsh7th/cmp-nvim-lua",
      "hrsh7th/cmp-emoji",
    },
  }
  use {
    "tzachar/cmp-tabnine",
    run = "./install.sh",
    requires = "hrsh7th/nvim-cmp",
    opt = true,
    event = "InsertEnter",
  }

  -- snippets
  use "L3MON4D3/LuaSnip" --snippet engine
  use "rafamadriz/friendly-snippets" -- a bunch of snippets to use

  -- Autopairs
  use "windwp/nvim-autopairs"

  -- TreeSitter
  use {
    "nvim-treesitter/nvim-treesitter",
    run = ":TSUpdate",
  }
  use {
    "nvim-treesitter/nvim-treesitter-textobjects",
    after = "nvim-treesitter",
  }

  -- Git
  use "lewis6991/gitsigns.nvim"

  -- Bufferline
  use "akinsho/bufferline.nvim"
  use "famiu/bufdelete.nvim"

  -- Statusline
  use {
    "NTBBloodbath/galaxyline.nvim",
    requires = { "kyazdani42/nvim-web-devicons", opt = true },
  }

  -- Indent Blankline
  use {
    "lukas-reineke/indent-blankline.nvim",
  }

  -- Presence
  use "andweeb/presence.nvim"

  -- Markdown Preview
  use {
    "iamcco/markdown-preview.nvim",
    run = "cd app && npm install",
    ft = "markdown",
  }
  use { "ellisonleao/glow.nvim", branch = "main", ft = "markdown" }

  -- Dim
  use {
    "narutoxy/dim.lua",
    requires = { "nvim-treesitter/nvim-treesitter", "neovim/nvim-lspconfig" },
  }

  -- tpope d best
  use "tpope/vim-surround"
  use "tpope/vim-fugitive"
  use "tpope/vim-unimpaired"
  use "tpope/vim-repeat"

  -- Automatically set up your configuration after cloning packer.nvim
  -- Put this at the end after all plugins
  if PACKER_BOOTSTRAP then
    require("packer").sync()
  end
end)
