local M = {}

function M.setup()
	local status_ok, nvim_tree_config = pcall(require, "nvim-tree.config")
	if not status_ok then
		return
	end

	if _G._setup_called then
		return
	end

	local nvimtree_config = {
		active = true,
		on_config_done = nil,
		setup = {
			create_in_closed_folder = false,
			disable_netrw = true,
			hijack_netrw = true,
			open_on_setup = false,
			open_on_setup_file = false,
			sort_by = "name",
			ignore_buffer_on_setup = false,
			ignore_ft_on_setup = {
				"startify",
				"dashboard",
				"alpha",
			},
			auto_reload_on_write = true,
			hijack_unnamed_buffer_when_opening = false,
			hijack_directories = {
				enable = true,
				auto_open = true,
			},
			open_on_tab = false,
			hijack_cursor = false,
			update_cwd = true,
			diagnostics = {
				enable = true,
				show_on_dirs = false,
				icons = {
					hint = "",
					info = "",
					warning = "",
					error = "",
				},
			},
			update_focused_file = {
				enable = true,
				update_cwd = true,
				ignore_list = {},
			},
			system_open = {
				cmd = nil,
				args = {},
			},
			git = {
				enable = true,
				ignore = false,
				timeout = 200,
			},
			view = {
				width = 30,
				height = 30,
				hide_root_folder = false,
				side = "left",
				preserve_window_proportions = false,
				mappings = {
					custom_only = false,
					list = {},
				},
				number = false,
				relativenumber = false,
				signcolumn = "yes",
			},
			renderer = {
				add_trailing = false,
				group_empty = false,
				highlight_opened_files = "none",
				indent_markers = {
					enable = false,
					icons = {
						corner = "└ ",
						edge = "│ ",
						none = "  ",
					},
				},
				icons = {
					webdev_colors = true,
					show = {
						git = true,
						folder = true,
						file = true,
						folder_arrow = true,
					},
					glyphs = {
						default = "",
						symlink = "",
						git = {
							unstaged = "",
							staged = "S",
							unmerged = "",
							renamed = "➜",
							deleted = "",
							untracked = "U",
							ignored = "◌",
						},
						folder = {
							default = "",
							open = "",
							empty = "",
							empty_open = "",
							symlink = "",
						},
					},
				},
				highlight_git = true,
				root_folder_modifier = ":t",
			},
			filters = {
				dotfiles = false,
				-- custom = { "node_modules", "\\.cache" },
				exclude = {},
			},
			trash = {
				cmd = "trash",
				require_confirm = true,
			},
			log = {
				enable = false,
				truncate = false,
				types = {
					all = false,
					config = false,
					copy_paste = false,
					diagnostics = false,
					git = false,
					profile = false,
				},
			},
			actions = {
				use_system_clipboard = true,
				change_dir = {
					enable = true,
					global = false,
					restrict_above_cwd = false,
				},
				open_file = {
					quit_on_open = false,
					resize_window = false,
					window_picker = {
						enable = true,
						chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ1234567890",
						exclude = {
							filetype = { "notify", "packer", "qf", "diff", "fugitive", "fugitiveblame" },
							buftype = { "nofile", "terminal", "help" },
						},
					},
				},
			},
		},
	}

	for opt, val in pairs(nvimtree_config) do
		vim.g["nvim_tree_" .. opt] = val
	end

	local tree_view = require "nvim-tree.view"
	local tree_cb = nvim_tree_config.nvim_tree_callback
	nvimtree_config.setup.view.mappings.list = {
		{ key = { "l", "<CR>", "o" }, cb = tree_cb "edit" },
		{ key = "h", cb = tree_cb "close_node" },
		{ key = "v", cb = tree_cb "vsplit" },
		{ key = "C", cb = tree_cb "cd" },
	}

	-- Add nvim_tree open callback
	local open = tree_view.open
	tree_view.open = function()
		open()
	end

	vim.api.nvim_create_autocmd("BufEnter", {
		nested = true,
		callback = function()
			if #vim.api.nvim_list_wins() == 1 and vim.api.nvim_buf_get_name(0):match "NvimTree_" ~= nil then
				vim.cmd "quit"
			end
		end,
	})

	local events = require "nvim-tree.events"

	events.on_file_created(function(file)
		vim.cmd("edit " .. file.fname)
	end)

	_G._setup_called = true

	require("nvim-tree").setup(nvimtree_config.setup)
end

-- function M.on_close()
-- 	local buf = tonumber(vim.fn.expand("<abuf>"))
-- 	local ft = vim.api.nvim_buf_get_option(buf, "filetype")
-- 	if ft == "NvimTree" and package.loaded["bufferline.state"] then
-- 		require("bufferline.state").set_offset(0)
-- 	end
-- end

function M.change_tree_dir(dir)
	local lib_status_ok, lib = pcall(require, "nvim-tree.lib")
	if lib_status_ok then
		lib.change_dir(dir)
	end
end

return M
