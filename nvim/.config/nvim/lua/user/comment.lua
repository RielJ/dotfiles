local M = {}

M.setup = function()
	local status_ok, comment = pcall(require, "Comment")
	if not status_ok then
		return
	end

	comment.setup({
		pre_hook = function(ctx)
			-- Only calculate commentstring for tsx filetypes
			if vim.bo.filetype == "typescriptreact" then
				local U = require("Comment.utils")

				-- Determine whether to use linewise or blockwise commentstring
				local type = ctx.ctype == U.ctype.line and "__default" or "__multiline"

				-- Determine the location where to calculate commentstring from
				local location = nil
				if ctx.ctype == U.ctype.block then
					location = require("ts_context_commentstring.utils").get_cursor_location()
				elseif ctx.cmotion == U.cmotion.v or ctx.cmotion == U.cmotion.V then
					location = require("ts_context_commentstring.utils").get_visual_start_location()
				end

				return require("ts_context_commentstring.internal").calculate_commentstring({
					key = type,
					location = location,
				})
			end
			-- local U = require("Comment.utils")

			-- local location = nil

			-- if ctx.ctype == U.ctype.block then
			-- 	location = require("ts_context_commentstring.utils").get_cursor_location()
			-- elseif ctx.cmotion == U.cmotion.v or ctx.cmotion == U.cmotion.V then
			-- 	location = require("ts_context_commentstring.utils").get_visual_start_location()
			-- end

			-- return require("ts_context_commentstring.internal").calculate_commentstring({
			-- 	key = ctx.ctype == U.ctype.line and "__default" or "__multiline",
			-- 	location = location,
			-- })
		end,

		---Add a space b/w comment and the line
		---@type boolean
		padding = true,

		---Lines to be ignored while comment/uncomment.
		---Could be a regex string or a function that returns a regex string.
		---Example: Use '^$' to ignore empty lines
		---@type string|function
		ignore = "^$",

		---Whether to create basic (operator-pending) and extra mappings for NORMAL/VISUAL mode
		---@type table
		mappings = {
			---operator-pending mapping
			---Includes `gcc`, `gcb`, `gc[count]{motion}` and `gb[count]{motion}`
			basic = true,
			---extended mapping
			---Includes `g>`, `g<`, `g>[count]{motion}` and `g<[count]{motion}`
			extra = false,
		},

		---LHS of line and block comment toggle mapping in NORMAL/VISUAL mode
		---@type table
		toggler = {
			---line-comment toggle
			line = "gcc",
			---block-comment toggle
			block = "gbc",
		},

		---LHS of line and block comment operator-mode mapping in NORMAL/VISUAL mode
		---@type table
		opleader = {
			---line-comment opfunc mapping
			line = "gc",
			---block-comment opfunc mapping
			block = "gb",
		},
	})
end
return M
