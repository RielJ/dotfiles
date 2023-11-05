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
    -- width = 100000,
    -- height = 100000,
    winblend = 0,
    highlights = {
      border = "Normal",
      background = "Normal",
    },
  },
  on_open = function(_)
    vim.cmd "startinsert!"
  end,
  on_close = function(_) end,
  count = 99,
}

M._exec_toggle = function(opts)
  local term = Terminal:new { cmd = opts.cmd, count = opts.count, direction = opts.direction }
  term:toggle(opts.size, opts.direction)
end

M._lazygit_toggle = function()
  lazygit:toggle()
end

return M
