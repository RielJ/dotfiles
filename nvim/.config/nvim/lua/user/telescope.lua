local builtin = require("telescope.builtin")
local action_state = require("telescope.actions.state")
local themes = require("telescope.themes")

local M = {}

-- another file string search
function M.find_string()
	local opts = {
		border = true,
		previewer = false,
		shorten_path = false,
		layout_strategy = "flex",
		layout_config = {
			width = 0.9,
			height = 0.8,
			horizontal = { width = { padding = 0.15 } },
			vertical = { preview_height = 0.75 },
		},
		file_ignore_patterns = {
			"vendor/*",
			"node_modules",
			"%.jpg",
			"%.jpeg",
			"%.png",
			"%.svg",
			"%.otf",
			"%.ttf",
			"*lock.json",
			"%.lock",
		},
	}
	builtin.live_grep(opts)
end

-- fince file browser using telescope instead of lir
function M.file_browser()
	local opts

	opts = {
		sorting_strategy = "ascending",
		scroll_strategy = "cycle",
		layout_config = {
			prompt_position = "top",
		},
		file_ignore_patterns = { "vendor/*" },

		attach_mappings = function(prompt_bufnr, map)
			local current_picker = action_state.get_current_picker(prompt_bufnr)

			local modify_cwd = function(new_cwd)
				current_picker.cwd = new_cwd
				current_picker:refresh(opts.new_finder(new_cwd), { reset_prompt = true })
			end

			map("i", "-", function()
				modify_cwd(current_picker.cwd .. "/..")
			end)

			map("i", "~", function()
				modify_cwd(vim.fn.expand("~"))
			end)

			local modify_depth = function(mod)
				return function()
					opts.depth = opts.depth + mod

					local this_picker = action_state.get_current_picker(prompt_bufnr)
					this_picker:refresh(opts.new_finder(current_picker.cwd), { reset_prompt = true })
				end
			end

			map("i", "<M-=>", modify_depth(1))
			map("i", "<M-+>", modify_depth(-1))

			map("n", "yy", function()
				local entry = action_state.get_selected_entry()
				vim.fn.setreg("+", entry.value)
			end)

			return true
		end,
	}

	builtin.file_browser(opts)
end


function M.code_actions()
	local opts = {
		layout_config = {
			prompt_position = "top",
			width = 80,
			height = 12,
		},
		borderchars = {
			prompt = { "─", "│", " ", "│", "╭", "╮", "│", "│" },
			results = { "─", "│", "─", "│", "├", "┤", "╯", "╰" },
			preview = { "─", "│", "─", "│", "╭", "╮", "╯", "╰" },
		},
		border = {},
		previewer = false,
		shorten_path = false,
	}
	builtin.lsp_code_actions(themes.get_dropdown(opts))
end

-- show refrences to this using language server
function M.lsp_references()
	local opts = {
		layout_strategy = "vertical",
		layout_config = {
			prompt_position = "top",
		},
		sorting_strategy = "ascending",
		ignore_filename = false,
	}
	builtin.lsp_references(opts)
end

-- show implementations of the current thingy using language server
function M.lsp_implementations()
	local opts = {
		layout_strategy = "vertical",
		layout_config = {
			prompt_position = "top",
		},
		sorting_strategy = "ascending",
		ignore_filename = false,
	}
	builtin.lsp_implementations(opts)
end

-- find files in the upper directory
function M.find_updir()
	local up_dir = vim.fn.getcwd():gsub("(.*)/.*$", "%1")
	local opts = {
		cwd = up_dir,
	}

	builtin.find_files(opts)
end

function M.setup()
	local previewers = require("telescope.previewers")
	local sorters = require("telescope.sorters")
	local actions = require("telescope.actions")

	local config = {
		defaults = {
			prompt_prefix = " ",
			selection_caret = " ",
			entry_prefix = "  ",
			initial_mode = "insert",
			selection_strategy = "reset",
			sorting_strategy = "descending",
			layout_strategy = "horizontal",
			layout_config = {
				width = 0.75,
				preview_cutoff = 120,
				horizontal = { mirror = false },
				vertical = { mirror = false },
			},
			vimgrep_arguments = {
				"rg",
				"--color=never",
				"--no-heading",
				"--with-filename",
				"--line-number",
				"--column",
				"--smart-case",
				"--hidden",
			},
			file_ignore_patterns = {},
			path_display = { shorten = 5 },
			winblend = 0,
			border = {},
			borderchars = { "─", "│", "─", "│", "╭", "╮", "╯", "╰" },
			color_devicons = true,
			set_env = { ["COLORTERM"] = "truecolor" }, -- default = nil,
			pickers = {
				find_files = {
					find_command = { "fd", "--type=file", "--hidden", "--smart-case" },
				},
				live_grep = {
					--@usage don't include the filename in the search results
					only_sort_text = true,
				},
			},
		},
		extensions = {
			fzf = {
				fuzzy = true, -- false will only do exact matching
				override_generic_sorter = true, -- override the generic sorter
				override_file_sorter = true, -- override the file sorter
				case_mode = "smart_case", -- or "ignore_case" or "respect_case"
			},
		},
		file_previewer = previewers.vim_buffer_cat.new,
		grep_previewer = previewers.vim_buffer_vimgrep.new,
		qflist_previewer = previewers.vim_buffer_qflist.new,
		file_sorter = sorters.get_fuzzy_file,
		generic_sorter = sorters.get_generic_fuzzy_sorter,
		---@usage Mappings are fully customizable. Many familiar mapping patterns are setup as defaults.
		mappings = {
			i = {
				["<C-n>"] = actions.cycle_history_next,
				["<C-p>"] = actions.cycle_history_prev,

				["<C-j>"] = actions.move_selection_next,
				["<C-k>"] = actions.move_selection_previous,

				["<C-c>"] = actions.close,

				["<Down>"] = actions.move_selection_next,
				["<Up>"] = actions.move_selection_previous,

				["<CR>"] = actions.select_default,
				["<C-x>"] = actions.select_horizontal,
				["<C-v>"] = actions.select_vertical,
				["<C-t>"] = actions.select_tab,

				["<C-u>"] = actions.preview_scrolling_up,
				["<C-d>"] = actions.preview_scrolling_down,

				["<PageUp>"] = actions.results_scrolling_up,
				["<PageDown>"] = actions.results_scrolling_down,

				["<Tab>"] = actions.toggle_selection + actions.move_selection_worse,
				["<S-Tab>"] = actions.toggle_selection + actions.move_selection_better,
				["<C-q>"] = actions.send_to_qflist + actions.open_qflist,
				["<M-q>"] = actions.send_selected_to_qflist + actions.open_qflist,
				["<C-l>"] = actions.complete_tag,
				["<C-_>"] = actions.which_key, -- keys from pressing <C-/>
			},

			n = {
				["<esc>"] = actions.close,
				["<CR>"] = actions.select_default,
				["<C-x>"] = actions.select_horizontal,
				["<C-v>"] = actions.select_vertical,
				["<C-t>"] = actions.select_tab,

				["<Tab>"] = actions.toggle_selection + actions.move_selection_worse,
				["<S-Tab>"] = actions.toggle_selection + actions.move_selection_better,
				["<C-q>"] = actions.send_to_qflist + actions.open_qflist,
				["<M-q>"] = actions.send_selected_to_qflist + actions.open_qflist,

				["j"] = actions.move_selection_next,
				["k"] = actions.move_selection_previous,
				["H"] = actions.move_to_top,
				["M"] = actions.move_to_middle,
				["L"] = actions.move_to_bottom,

				["<Down>"] = actions.move_selection_next,
				["<Up>"] = actions.move_selection_previous,
				["gg"] = actions.move_to_top,
				["G"] = actions.move_to_bottom,

				["<C-u>"] = actions.preview_scrolling_up,
				["<C-d>"] = actions.preview_scrolling_down,

				["<PageUp>"] = actions.results_scrolling_up,
				["<PageDown>"] = actions.results_scrolling_down,

				["?"] = actions.which_key,
			},
		},
	}

	local telescope = require("telescope")
	telescope.setup(config)

	-- if lvim.builtin.telescope.on_config_done then
	--   lvim.builtin.telescope.on_config_done(telescope)
	-- end

	telescope.load_extension("fzf")
end

return M
