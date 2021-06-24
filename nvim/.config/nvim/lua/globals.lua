CONFIG_PATH = vim.fn.stdpath('config')
DATA_PATH = vim.fn.stdpath('data')
CACHE_PATH = vim.fn.stdpath('cache')

O = {
}

vim.g.mapleader = " "
vim.g.colorscheme = "gruvbox"
vim.g.gruvbox_contrast_dark = 'hard'
vim.api.nvim_exec(
[[
augroup highlight_yank
    autocmd!
    autocmd TextYankPost * silent! lua require'vim.highlight'.on_yank({timeout = 40})
augroup END
]], false)
