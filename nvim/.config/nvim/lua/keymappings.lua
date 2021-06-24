vim.api.nvim_set_keymap('n', '<leader>', '<NOP>', {noremap = true, silent = true})

-- better window movement
vim.api.nvim_set_keymap('n', '<C-h>', '<C-w>h', {silent = true})
vim.api.nvim_set_keymap('n', '<C-j>', '<C-w>j', {silent = true})
vim.api.nvim_set_keymap('n', '<C-k>', '<C-w>k', {silent = true})
vim.api.nvim_set_keymap('n', '<C-l>', '<C-w>l', {silent = true})

-- For Escaping 
vim.api.nvim_set_keymap('i', 'jk', '<ESC>', {noremap = true, silent = true})
vim.api.nvim_set_keymap('i', '<C-c>', '<ESC>', {noremap = true, silent = true})
vim.api.nvim_set_keymap('v', '<C-c>', '<ESC>', {noremap = true, silent = true})
          
-- For Copying to global registers
vim.api.nvim_set_keymap('n', '<leader>y', '"*y', {noremap = true, silent = true})
vim.api.nvim_set_keymap('n', '<leader>Y', 'gg"*yG', {noremap = true, silent = true})
vim.api.nvim_set_keymap('v', '<leader>y', '"*y', {noremap = true, silent = true})
vim.api.nvim_set_keymap('v', '<leader>p', '"*p', {noremap = true, silent = true})
vim.api.nvim_set_keymap('v', '<leader>P', '"*P', {noremap = true, silent = true})

-- Add Oneline before and stay in normal mode
vim.api.nvim_set_keymap('n', '<leader>o', 'o<ESC>', {noremap = true, silent = true})

vim.api.nvim_set_keymap('n', 'Q', '<NOP>', {noremap = true, silent = true})
vim.api.nvim_set_keymap('n', '<leader>+', ':vertical resize +5<CR>', {noremap = true, silent = true})
vim.api.nvim_set_keymap('n', '<leader>-', ':vertical resize -5<CR>', {noremap = true, silent = true})

-- "_ -> BlackHole Register
vim.api.nvim_set_keymap('n', '<leader>d', '"_d', {noremap = true, silent = true})
vim.api.nvim_set_keymap('v', '<leader>d', '"_d', {noremap = true, silent = true})
-- vim.api.nvim_set_keymap('v', '<leader>p', '"_P', {noremap = true, silent = true})

-- Tab switch buffer
vim.api.nvim_set_keymap('n', '<TAB>', ':bnext<CR>', {noremap = true, silent = true})
vim.api.nvim_set_keymap('n', '<S-TAB>', ':bprevious<CR>', {noremap = true, silent = true})

vim.api.nvim_set_keymap('v', 'J', '>+1<CR>gv=gv', {noremap = true, silent = true})
vim.api.nvim_set_keymap('v', 'K', '<-2<CR>gv=gv', {noremap = true, silent = true})

-- Telescope
vim.api.nvim_set_keymap('n', '<leader>ps', ":lua require('telescope.builtin').grep_string({search = vim.fn.input('Grep For > ;)})<CR>", {noremap = true, silent = true})
vim.api.nvim_set_keymap('n', '<leader>pp', ":lua require('telescope.builtin').git_files()<CR>", {noremap = true, silent = true})
vim.api.nvim_set_keymap('n', '<leader>pf', ":lua require('telescope.builtin').find_files({hidden = true})<CR>", {noremap = true, silent = true})
vim.api.nvim_set_keymap('n', '<leader>pb', ":lua require('telescope.builtin').buffers()<CR>", {noremap = true, silent = true})
vim.api.nvim_set_keymap('n', '<leader>va', ":lua require('lv-telescope').anime_selector()<CR>", {noremap = true, silent = true})

vim.api.nvim_set_keymap('n', '<Leader>e', ':NvimTreeToggle<CR>', {noremap = true, silent = true})

vim.api.nvim_set_keymap("n", "<leader>/", ":CommentToggle<CR>", {noremap = true, silent = true})
vim.api.nvim_set_keymap("v", "<leader>/", ":CommentToggle<CR>", {noremap = true, silent = true})

vim.api.nvim_set_keymap("n", "<leader>c", ":BufferClose<CR>", {noremap = true, silent = true})

-- Diagnostics
vim.api.nvim_set_keymap('n', '<leader>dt', ":TroubleToggle<CR>", {noremap = true, silent = true})
vim.api.nvim_set_keymap('n', '<leader>dw', ":TroubleToggle lsp_workspace_diagnostics<CR>", {noremap = true, silent = true})
vim.api.nvim_set_keymap('n', '<leader>dd', ":TroubleToggle lsp_document_diagnostics<CR>", {noremap = true, silent = true})
vim.api.nvim_set_keymap('n', '<leader>dq', ":TroubleToggle quickfix<CR>", {noremap = true, silent = true})
vim.api.nvim_set_keymap('n', '<leader>dl', ":TroubleToggle loclist<CR>", {noremap = true, silent = true})
vim.api.nvim_set_keymap('n', '<leader>dr', ":TroubleToggle lsp_references<CR>", {noremap = true, silent = true})

-- LSP
vim.api.nvim_set_keymap('n', '<leader>la', ":Lspsaga code_action<CR>", {noremap = true, silent = true})
vim.api.nvim_set_keymap('n', '<leader>lA', ":Lspsaga range_code_action<CR>", {noremap = true, silent = true})
vim.api.nvim_set_keymap('n', '<leader>ld', ":Telescope lsp_document_diagnostics<CR>", {noremap = true, silent = true})
vim.api.nvim_set_keymap('n', '<leader>lD', ":Telescope lsp_workspace_diagnostics<CR>", {noremap = true, silent = true})
vim.api.nvim_set_keymap('n', '<leader>lf', ":LspFormatting<CR>", {noremap = true, silent = true})
vim.api.nvim_set_keymap('n', '<leader>li', ":LspInfo<CR>", {noremap = true, silent = true})
vim.api.nvim_set_keymap('n', '<leader>ll', ":Lspsaga lsp_finder<CR>", {noremap = true, silent = true})
vim.api.nvim_set_keymap('n', '<leader>lL', ":Lspsaga show_line_diagnostics<CR>", {noremap = true, silent = true})
vim.api.nvim_set_keymap('n', '<leader>lp', ":Lspsaga preview_definition<CR>", {noremap = true, silent = true})
vim.api.nvim_set_keymap('n', '<leader>lq', ":Telescope quickfix<CR>", {noremap = true, silent = true})
vim.api.nvim_set_keymap('n', '<leader>lr', ":Lspsaga rename<CR>", {noremap = true, silent = true})
vim.api.nvim_set_keymap('n', '<leader>lt', ":LspTypeDefinition<CR>", {noremap = true, silent = true})
vim.api.nvim_set_keymap('n', '<leader>lx', ":cclose<CR>", {noremap = true, silent = true})
vim.api.nvim_set_keymap('n', '<leader>ls', ":Telescope lsp_document_symbols<CR>", {noremap = true, silent = true})
vim.api.nvim_set_keymap('n', '<leader>lS', ":Telescope lsp_dynamic_workspace_symbols<CR>", {noremap = true, silent = true})
