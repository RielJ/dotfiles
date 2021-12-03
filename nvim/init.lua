require "user.defaults"

require("user.plugin-loader").setup()
require "user.plugins"

vim.o.background = "dark"
vim.cmd [[colorscheme gruvbox]]
