local M = {}
local Terminal = require("toggleterm.terminal").Terminal
local lazygit = Terminal:new {
	cmd = "lazygit",
	hidden = true,
	direction = "float",
	float_opts = {
		-- The border key is *almost* the same as 'nvim_win_open'
		-- see :h nvim_win_open for details on borders however
		-- the 'curved' border is a custom border type
		-- not natively supported but implemented in this plugin.
		-- border = 'single' | 'double' | 'shadow' | 'curved' | ... other options supported by win open
		border = "curved",
		-- width = <value>,
		-- height = <value>,
		winblend = 0,
		highlights = {
			border = "Normal",
			background = "Normal",
		},
	},
}

M.toggle_lazygit = function()
	lazygit:toggle()
end

return M
