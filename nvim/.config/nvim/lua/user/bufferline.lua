local M = {}

M.close_except_current = function()
	vim.cmd("BufferLineCloseLeft")
	vim.cmd("BufferLineCloseRight")
end

M.setup = function()
	local status_ok, bufferline = pcall(require, "bufferline")
	if not status_ok then
		return
	end

	local fn = vim.fn

	local function is_ft(b, ft)
		return vim.bo[b].filetype == ft
	end

	local symbols = { error = " ", warning = " ", info = "" }

	local function diagnostics_indicator(_, _, diagnostics)
		local result = {}
		for name, count in pairs(diagnostics) do
			if symbols[name] and count > 0 then
				table.insert(result, symbols[name] .. count)
			end
		end
		result = table.concat(result, " ")
		return #result > 0 and result or ""
	end

	local function custom_filter(buf, buf_nums)
		local logs = vim.tbl_filter(function(b)
			return is_ft(b, "log")
		end, buf_nums)
		if vim.tbl_isempty(logs) then
			return true
		end
		local tab_num = vim.fn.tabpagenr()
		local last_tab = vim.fn.tabpagenr("$")
		local is_log = is_ft(buf, "log")
		if last_tab == 1 then
			return true
		end
		-- only show log buffers in secondary tabs
		return (tab_num == last_tab and is_log) or (tab_num ~= last_tab and not is_log)
	end

	---@diagnostic disable-next-line: unused-function, unused-local
	local function sort_by_mtime(a, b)
		local astat = vim.loop.fs_stat(a.path)
		local bstat = vim.loop.fs_stat(b.path)
		local mod_a = astat and astat.mtime.sec or 0
		local mod_b = bstat and bstat.mtime.sec or 0
		return mod_a > mod_b
	end

	local groups = require("bufferline.groups")
	local List = require("plenary.collections.py_list")

	bufferline.setup({
		options = {
			-- sort_by = sort_by_mtime,
			sort_by = "id",
			show_close_icon = false,
			show_buffer_icons = true,
			close_command = "Bdelete! %d", -- can be a string | function, see "Mouse actions"
			right_mouse_command = "Bdelete! %d", -- can be a string | function, see "Mouse actions"
			left_mouse_command = "buffer %d", -- can be a string | function, see "Mouse actions"

			separator_style = "thin",
			enforce_regular_tabs = false,
			always_show_bufferline = false,
			diagnostics = "nvim_lsp",
			diagnostics_indicator = diagnostics_indicator,
			diagnostics_update_in_insert = false,
			custom_filter = custom_filter,
			offsets = {
				{
					filetype = "undotree",
					text = "Undotree",
					highlight = "PanelHeading",
					padding = 1,
				},
				{
					filetype = "NvimTree",
					text = "Explorer",
					highlight = "PanelHeading",
					padding = 1,
				},
				{
					filetype = "DiffviewFiles",
					text = "Diff View",
					highlight = "PanelHeading",
					padding = 1,
				},
				{
					filetype = "flutterToolsOutline",
					text = "Flutter Outline",
					highlight = "PanelHeading",
				},
				{
					filetype = "packer",
					text = "Packer",
					highlight = "PanelHeading",
					padding = 1,
				},
			},
			groups = {
				options = {
					toggle_hidden_on_enter = true,
				},
				items = {
					groups.builtin.ungrouped,
					{
						highlight = { guisp = "#51AFEF" },
						name = "tests",
						icon = "",
						matcher = function(buf)
							return buf.filename:match("_spec") or buf.filename:match("test")
						end,
					},
					{
						name = "view models",
						highlight = { guisp = "#03589C" },
						matcher = function(buf)
							return buf.filename:match("view_model%.dart")
						end,
					},
					{
						name = "screens",
						icon = "冷",
						matcher = function(buf)
							return buf.path:match("screen")
						end,
					},
					{
						highlight = { guisp = "#C678DD" },
						name = "docs",
						icon = "",
						matcher = function(buf)
							local list = List({ "md", "txt", "org", "norg", "wiki" })
							return list:contains(fn.fnamemodify(buf.path, ":e"))
						end,
					},
					{
						highlight = { guisp = "#F6A878" },
						name = "config",
						matcher = function(buf)
							return buf.filename:match("go.mod")
								or buf.filename:match("Cargo.toml")
								or buf.filename:match("manage.py")
								or buf.filename:match("Makefile")
						end,
					},
				},
			},
		},
		highlights = {
			-- 	fill = {
			-- 		guifg = { attribute = "fg", highlight = "#ff0000" },
			-- 		guibg = { attribute = "bg", highlight = "TabLine" },
			-- 	},
			-- 	background = {
			-- 		guifg = { attribute = "fg", highlight = "TabLine" },
			-- 		guibg = { attribute = "bg", highlight = "TabLine" },
			-- 	},

			-- 	-- buffer_selected = {
			-- 	--   guifg = {attribute='fg',highlight='#ff0000'},
			-- 	--   guibg = {attribute='bg',highlight='#0000ff'},
			-- 	--   gui = 'none'
			-- 	--   },
			-- 	buffer_visible = {
			-- 		guifg = { attribute = "fg", highlight = "TabLine" },
			-- 		guibg = { attribute = "bg", highlight = "TabLine" },
			-- 	},

			-- 	close_button = {
			-- 		guifg = { attribute = "fg", highlight = "TabLine" },
			-- 		guibg = { attribute = "bg", highlight = "TabLine" },
			-- 	},
			-- 	close_button_visible = {
			-- 		guifg = { attribute = "fg", highlight = "TabLine" },
			-- 		guibg = { attribute = "bg", highlight = "TabLine" },
			-- 	},
			-- 	-- close_button_selected = {
			-- 	--   guifg = {attribute='fg',highlight='TabLineSel'},
			-- 	--   guibg ={attribute='bg',highlight='TabLineSel'}
			-- 	--   },

			-- 	tab_selected = {
			-- 		guifg = { attribute = "fg", highlight = "Normal" },
			-- 		guibg = { attribute = "bg", highlight = "Normal" },
			-- 	},
			-- 	tab = {
			-- 		guifg = { attribute = "fg", highlight = "TabLine" },
			-- 		guibg = { attribute = "bg", highlight = "TabLine" },
			-- 	},
			-- 	tab_close = {
			-- 		-- guifg = {attribute='fg',highlight='LspDiagnosticsDefaultError'},
			-- 		guifg = { attribute = "fg", highlight = "TabLineSel" },
			-- 		guibg = { attribute = "bg", highlight = "Normal" },
			-- 	},

			-- 	duplicate_selected = {
			-- 		guifg = { attribute = "fg", highlight = "TabLineSel" },
			-- 		guibg = { attribute = "bg", highlight = "TabLineSel" },
			-- 		gui = "italic",
			-- 	},
			-- 	duplicate_visible = {
			-- 		guifg = { attribute = "fg", highlight = "TabLine" },
			-- 		guibg = { attribute = "bg", highlight = "TabLine" },
			-- 		gui = "italic",
			-- 	},
			-- 	duplicate = {
			-- 		guifg = { attribute = "fg", highlight = "TabLine" },
			-- 		guibg = { attribute = "bg", highlight = "TabLine" },
			-- 		gui = "italic",
			-- 	},

			-- 	modified = {
			-- 		guifg = { attribute = "fg", highlight = "TabLine" },
			-- 		guibg = { attribute = "bg", highlight = "TabLine" },
			-- 	},
			-- 	modified_selected = {
			-- 		guifg = { attribute = "fg", highlight = "Normal" },
			-- 		guibg = { attribute = "bg", highlight = "Normal" },
			-- 	},
			-- 	modified_visible = {
			-- 		guifg = { attribute = "fg", highlight = "TabLine" },
			-- 		guibg = { attribute = "bg", highlight = "TabLine" },
			-- 	},

			-- 	separator = {
			-- 		guifg = { attribute = "bg", highlight = "TabLine" },
			-- 		guibg = { attribute = "bg", highlight = "TabLine" },
			-- 	},
			-- 	separator_selected = {
			-- 		guifg = { attribute = "bg", highlight = "Normal" },
			-- 		guibg = { attribute = "bg", highlight = "Normal" },
			-- 	},
			-- 	-- separator_visible = {
			-- 	--   guifg = {attribute='bg',highlight='TabLine'},
			-- 	--   guibg = {attribute='bg',highlight='TabLine'}
			-- 	--   },
			indicator_selected = {
				guifg = { attribute = "fg", highlight = "LspDiagnosticsDefaultHint" },
				guibg = { attribute = "bg", highlight = "Normal" },
			},
		},
	})
end

return M
