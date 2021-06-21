vim.api.nvim_set_keymap('n', '<leader>', '<NOP>', {noremap = true, silent = true})

-- For Escaping 
vim.api.nvim_set_keymap('i', 'jk', '<ESC>', {noremap = true, silent = true})
vim.api.nvim_set_keymap('i', '<C-c>', '<ESC>', {noremap = true, silent = true})
vim.api.nvim_set_keymap('v', '<C-c>', '<ESC>', {noremap = true, silent = true})
          
-- For Copying to global registers
vim.api.nvim_set_keymap('n', '<leader>y', '"+y', {noremap = true, silent = true})
vim.api.nvim_set_keymap('n', '<leader>Y', 'gg"+yG', {noremap = true, silent = true})
vim.api.nvim_set_keymap('v', '<leader>y', '"+y', {noremap = true, silent = true})

-- Add Oneline before and stay in normal mode
vim.api.nvim_set_keymap('n', '<leader>o', 'o<ESC>', {noremap = true, silent = true})

vim.api.nvim_set_keymap('n', 'Q', '<NOP>', {noremap = true, silent = true})
vim.api.nvim_set_keymap('n', '<leader>+', ':vertical resize +5<CR>', {noremap = true, silent = true})
vim.api.nvim_set_keymap('n', '<leader>-', ':vertical resize -5<CR>', {noremap = true, silent = true})

-- "_ -> BlackHole Register
vim.api.nvim_set_keymap('n', '<leader>d', '"_d', {noremap = true, silent = true})
vim.api.nvim_set_keymap('v', '<leader>d', '"_d', {noremap = true, silent = true})
vim.api.nvim_set_keymap('v', '<leader>p', '"_P', {noremap = true, silent = true})


vim.api.nvim_set_keymap('v', 'J', '>+1<CR>gv=gv', {noremap = true, silent = true})
vim.api.nvim_set_keymap('v', 'K', '<-2<CR>gv=gv', {noremap = true, silent = true})

vim.api.nvim_set_keymap('n', '<leader>ps', ":lua require('telescope.builtin').grep_string({search = vim.fn.input('Grep For > ;)})<CR>", {noremap = true, silent = true})
vim.api.nvim_set_keymap('n', '<C-p>', ":lua require('telescope.builtin').git_files()<CR>", {noremap = true, silent = true})
vim.api.nvim_set_keymap('n', '<leader>pf', ":lua require('telescope.builtin').find_files()<CR>", {noremap = true, silent = true})
vim.api.nvim_set_keymap('n', '<leader>pb', ":lua require('telescope.builtin').buffers()<CR>", {noremap = true, silent = true})
vim.api.nvim_set_keymap('n', '<leader>va', ":lua require('lv-telescope').anime_selector()<CR>", {noremap = true, silent = true})
