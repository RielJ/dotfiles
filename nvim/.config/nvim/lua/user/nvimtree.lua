local M = {}

function M.setup()
	local status_ok, nvim_tree_config = pcall(require, "nvim-tree.config")
	if not status_ok then
		return
	end

	local nvimtree_config = {
		active = true,
		on_config_done = nil,
		setup = {
			disable_netrw = true,
			hijack_netrw = true,
			open_on_setup = false,
			ignore_ft_on_setup = {
				"startify",
				"dashboard",
				"alpha",
			},
			auto_close = true,
			open_on_tab = false,
			update_to_buf_dir = {
				enable = true,
				auto_open = true,
			},
			hijack_cursor = false,
			update_cwd = false,
			diagnostics = {
				enable = true,
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
				ignore = true,
				timeout = 200,
			},
			view = {
				width = 30,
				height = 30,
				side = "left",
				auto_resize = true,
				number = false,
				relativenumber = false,
				mappings = {
					custom_only = false,
					list = {},
				},
			},
			filters = {
				dotfiles = false,
				custom = { ".git", "node_modules", ".cache" },
			},
		},
		show_icons = {
			git = 1,
			folders = 1,
			files = 1,
			folder_arrows = 1,
			tree_width = 30,
		},
		highlight_opened_files = 3,
		quit_on_open = 0,
		git_hl = 1,
		disable_window_picker = 0,
		root_folder_modifier = ":t",
		icons = {
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
	}

	for opt, val in pairs(nvimtree_config) do
		vim.g["nvim_tree_" .. opt] = val
	end

	local tree_view = require("nvim-tree.view")
	local tree_cb = nvim_tree_config.nvim_tree_callback
	nvimtree_config.setup.view.mappings.list = {
		{ key = { "l", "<CR>", "o" }, cb = tree_cb("edit") },
		{ key = "h", cb = tree_cb("close_node") },
		{ key = "v", cb = tree_cb("vsplit") },
		{ key = "C", cb = tree_cb("cd") },
	}

	-- Add nvim_tree open callback
	local open = tree_view.open
	tree_view.open = function()
		open()
	end

	vim.cmd("au WinClosed * lua require('user.nvimtree').on_close()")

	require("nvim-tree").setup(nvimtree_config.setup)
end

function M.on_close()
	local buf = tonumber(vim.fn.expand("<abuf>"))
	local ft = vim.api.nvim_buf_get_option(buf, "filetype")
	if ft == "NvimTree" and package.loaded["bufferline.state"] then
		require("bufferline.state").set_offset(0)
	end
end

function M.change_tree_dir(dir)
	local lib_status_ok, lib = pcall(require, "nvim-tree.lib")
	if lib_status_ok then
		lib.change_dir(dir)
	end
end

return M
