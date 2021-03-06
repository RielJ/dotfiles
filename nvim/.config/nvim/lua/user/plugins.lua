require("user.plugin-loader").setup()
return require("packer").startup(function(use)
	use "wbthomason/packer.nvim"

	use {
		"lewis6991/impatient.nvim",
		disable = false,
		config = function()
			require "user.other"
		end,
	}

	-- Colorscheme
	use { "ellisonleao/gruvbox.nvim", requires = { "rktjmp/lush.nvim" } }
	use "bluz71/vim-nightfly-guicolors"
	use "sainnhe/gruvbox-material"
	use "glepnir/zephyr-nvim"

	-- LSP
	use "neovim/nvim-lspconfig" -- enable LSP
	use {
		"j-hui/fidget.nvim",
		config = function()
			require("fidget").setup {}
		end,
	}
	use "williamboman/nvim-lsp-installer" -- simple to use language server installer
	use {
		"antoinemadec/FixCursorHold.nvim",
		run = function()
			vim.g.curshold_updatime = 1000
		end,
	} -- Needed while issue https://github.com/neovim/neovim/issues/12587 is still open
	use "onsails/lspkind-nvim"
	use "jose-elias-alvarez/null-ls.nvim"
	use {
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
			require("user.tss").config()
		end,
		before = "williamboman/nvim-lsp-installer",
	}
	use {
		"folke/lsp-trouble.nvim",
		cmd = "Trouble",
		config = function()
			-- Can use P to toggle auto movement
			require("trouble").setup {
				auto_preview = false,
				auto_fold = true,
			}
		end,
	}
	use {
		"AckslD/nvim-neoclip.lua",
		config = function()
			require("neoclip").setup()
		end,
	}

	use {
		"windwp/nvim-ts-autotag",
		config = function()
			require("nvim-ts-autotag").setup {
				filetypes = { "typescript", "typescriptreact", "vue" },
			}
		end,
		ft = { "typescript", "typescriptreact", "vue" },
	} -- automatically close jsx tags
	use {
		"ray-x/lsp_signature.nvim",
		config = function()
			require("user.lsp-signature").config()
		end,
		event = { "BufRead", "BufNew" },
	}
	use {
		"kosayoda/nvim-lightbulb",
		config = function()
			vim.fn.sign_define("LightBulbSign", { text = "", texthl = "DiagnosticInfo" })
		end,
		event = "BufRead",
		ft = { "rust", "go", "typescript", "typescriptreact" },
	}

	-- Terminal
	use {
		"akinsho/toggleterm.nvim",
		event = "BufWinEnter",
		config = function()
			require("user.terminal").config()
		end,
	}

	-- XML Attributes
	use { "whatyouhide/vim-textobj-xmlattr", requires = { "kana/vim-textobj-user" } }

	-- log highlighter
	use { "mtdl9/vim-log-highlighting", ft = { "text", "log" } }

	-- Spectre
	use {
		"windwp/nvim-spectre",
		event = "BufRead",
		config = function()
			require("user.spectre").config()
		end,
	}

	-- hlslens
	use {
		"kevinhwang91/nvim-hlslens",
		config = function()
			require("user.hlslens").config()
		end,
		event = "BufReadPost",
	}

	-- Matchup
	use {
		"andymass/vim-matchup",
		event = "BufReadPost",
		config = function()
			vim.g.matchup_enabled = 1
			vim.g.matchup_surround_enabled = 1
			vim.g.matchup_matchparen_deferred = 1
			vim.g.matchup_matchparen_offscreen = { method = "popup" }
		end,
	}

	-- Cheatsheet
	use {
		"RishabhRD/nvim-cheat.sh",
		requires = "RishabhRD/popfix",
		config = function()
			vim.g.cheat_default_window_layout = "vertical_split"
		end,
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
		config = function()
			require("user.comment").setup()
		end,
		requires = { "JoosepAlviste/nvim-ts-context-commentstring" },
	}
	use {
		"JoosepAlviste/nvim-ts-context-commentstring",
		event = "BufReadPost",
	}
	use {
		"folke/todo-comments.nvim",
		requires = "nvim-lua/plenary.nvim",
		config = function()
			require("user.todo-comments").config()
		end,
		event = "BufRead",
	}

	-- Dashboard
	use {
		"goolord/alpha-nvim",
		config = function()
			require("user.dashboard").config()
		end,
	}

	-- NvimTree
	use {
		"kyazdani42/nvim-tree.lua",
		requires = "kyazdani42/nvim-web-devicons",
		config = function()
			require("user.nvimtree").setup()
		end,
	}

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

	-- Completion
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
	use {
		"tzachar/cmp-tabnine",
		run = "./install.sh",
		requires = "hrsh7th/nvim-cmp",
		config = function()
			local tabnine = require "cmp_tabnine.config"
			tabnine:setup {
				max_lines = 1000,
				max_num_results = 10,
				sort = true,
			}
		end,
		opt = true,
		event = "InsertEnter",
	}

	-- snippets
	use "L3MON4D3/LuaSnip" --snippet engine
	use "rafamadriz/friendly-snippets" -- a bunch of snippets to use

	-- Autopairs
	use {
		"windwp/nvim-autopairs",
		-- event = "InsertEnter",
		config = function()
			require("user.autopairs").setup()
		end,
	}

	-- TreeSitter
	use {
		"nvim-treesitter/nvim-treesitter",
		run = ":TSUpdate",
		config = function()
			require("user.treesitter").setup()
		end,
	}
	use {
		"nvim-treesitter/nvim-treesitter-textobjects",
		after = "nvim-treesitter",
	}

	-- Git
	use {
		"lewis6991/gitsigns.nvim",
		config = function()
			require("user.gitsigns").setup()
		end,
	}

	-- Bufferline
	use {

		"akinsho/bufferline.nvim",
		config = function()
			require("user.bufferline").setup()
		end,
	}
	use "famiu/bufdelete.nvim"

	-- Statusline
	use {
		"NTBBloodbath/galaxyline.nvim",
		config = function()
			require("user.galaxyline").setup()
		end,
		requires = { "kyazdani42/nvim-web-devicons", opt = true },
	}

	-- Indent Blankline
	use {
		"lukas-reineke/indent-blankline.nvim",
		setup = function()
			vim.g.indent_blankline_char = "▏"
		end,
		config = function()
			require("user.indent-blankline").setup()
		end,
		event = "BufRead",
	}

	-- Presence
	use {
		"andweeb/presence.nvim",
		disable = false,
		config = function()
			require("user.presence").setup()
		end,
	}

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
		config = function()
			require("dim").setup {}
		end,
	}

	-- tpope d best
	use "tpope/vim-surround"
	use "tpope/vim-fugitive"
	use "tpope/vim-unimpaired"
	use "tpope/vim-repeat"
	use "tpope/vim-sleuth" -- detects indentation

	-- Automatically set up your configuration after cloning packer.nvim
	-- Put this at the end after all plugins
	if PACKER_BOOTSTRAP then
		require("packer").sync()
	end
end)
