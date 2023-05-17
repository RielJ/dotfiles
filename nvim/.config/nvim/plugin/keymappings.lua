local opts = { noremap = true, silent = true }

local term_opts = { silent = true }

-- Shorten function name
local keymap = vim.api.nvim_set_keymap

-- Normal --
-- better window movement
keymap("n", "<C-h>", "<C-w>h", term_opts)
keymap("n", "<C-j>", "<C-w>j", term_opts)
keymap("n", "<C-k>", "<C-w>k", term_opts)
keymap("n", "<C-l>", "<C-w>l", term_opts)

-- LSP --
keymap("n", "<leader>lf", "<cmd>lua require('rielj.lsp.handlers').format()<CR>", opts)
keymap(
  "n",
  "<leader>lr",
  "<ESC><CMD>lua vim.lsp.buf.rename(nil, {filter = require('rielj.lsp.handlers').rename_filter})<CR>",
  opts
)
keymap("n", "<leader>la", "<cmd>lua vim.lsp.buf.code_action()<CR>", opts)
keymap("n", "<leader>lA", "<cmd>lua vim.lsp.codelens.run()<cr>", opts)
keymap("n", "<leader>ld", "<cmd>Telescope diagnostics bufnr=0 theme=get_ivy<cr>", opts)
keymap("n", "<leader>lw", "<cmd>Telescope diagnostics<cr>", opts)
keymap("n", "<leader>lj", "<cmd>lua vim.diagnostic.goto_next()<CR>", opts)
keymap("n", "<leader>lk", "<cmd>lua vim.diagnostic.goto_prev()<CR>", opts)
keymap("n", "<leader>ll", "<cmd>lua vim.lsp.codelens.run()<cr>", opts)
keymap("n", "<leader>lpd", "<cmd>lua require('rielj.lsp.peek').Peek('definition')<cr>", opts)
keymap("n", "<leader>lpt", "<cmd>lua require('rielj.lsp.peek').Peek('typeDefinition')<cr>", opts)
keymap("n", "<leader>lpi", "<cmd>lua require('rielj.lsp.peek').Peek('implementation')<cr>", opts)
keymap("n", "<leader>lq", "<cmd>lua vim.diagnostic.setloclist()<cr>", opts)
keymap("n", "<leader>ls", "<cmd>Telescope lsp_document_symbols<cr>", opts)
keymap("n", "<leader>lS", "<cmd>Telescope lsp_dynamic_workspace_symbols<cr>", opts)

-- LSP TYPESCRIPT --
keymap("n", "gs", "<cmd>lua require('typescript').actions.removeUnused()<cr>", opts)
keymap("n", "gS", "<cmd>lua require('typescript').actions.organizeImports()<cr>", opts)
keymap("n", "go", "<cmd>lua require('typescript').actions.addMissingImports()<cr>", opts)
keymap("n", "gA", "<cmd>lua require('typescript').actions.fixAll()<cr>", opts)
keymap("n", "gI", "<cmd>lua require('typescript').actions.renameFile(0, %)<cr>", opts)

-- Buffers --
keymap("n", "<leader>bf", "<cmd>Telescope buffers<cr>", opts)

-- Search --
keymap("n", "<leader>sb", "<cmd>Telescope git_branches<cr>", opts)
keymap("n", "<leader>sf", "<cmd>Telescope find_files<cr>", opts)
keymap("n", "<leader>sr", "<cmd>Telescope oldfiles<cr>", opts)
keymap("n", "<leader>sR", "<cmd>Telescope registers<cr>", opts)

-- Terminal --
-- Better terminal navigation
keymap("t", "<C-h>", "<C-\\><C-N><C-w>h", term_opts)
keymap("t", "<C-j>", "<C-\\><C-N><C-w>j", term_opts)
keymap("t", "<C-k>", "<C-\\><C-N><C-w>k", term_opts)
keymap("t", "<C-l>", "<C-\\><C-N><C-w>l", term_opts)
keymap("n", "<leader>lg", "<cmd>lua require 'rielj.terminal'._lazygit_toggle()<CR>", opts)

-- Cheatsheet
keymap("n", "?", "<cmd>CheatWithoutComments<cr>", opts)

-- Glow
keymap("n", "<leader>sg", "<cmd>Glow<CR>", opts)

-- Git --
keymap("n", "<leader>gj", "<cmd>lua require 'gitsigns'.next_hunk()<CR>", opts)
keymap("n", "<leader>gk", "<cmd>lua require 'gitsigns'.prev_hunk()<CR>", opts)
keymap("n", "<leader>gp", "<cmd>lua require 'gitsigns'.preview_hunk()<CR>", opts)
keymap("n", "<leader>gr", "<cmd>lua require 'gitsigns'.reset_hunk()<CR>", opts)
keymap("n", "<leader>gs", "<cmd>Telescope git_status<CR>", opts)
keymap("n", "<leader>gb", "<cmd>Telescope git_branches<CR>", opts)
keymap("n", "<leader>gb", "<cmd>Telescope git_branches<CR>", opts)

-- Spectre
keymap("n", "<leader>rf", "<cmd>lua require 'spectre'.open_file_search()<CR>", opts)
keymap("n", "<leader>rp", "<cmd>lua require 'spectre'.open()<CR>", opts)
keymap("n", "<leader>rw", "<cmd>lua require 'spectre'.open_visual({select_word=true})<CR>", opts)

-- Resize with arrows
keymap("n", "<C-Up>", ":resize +2<CR>", opts)
keymap("n", "<C-Down>", ":resize -2<CR>", opts)
keymap("n", "<C-Left>", ":vertical resize -2<CR>", opts)
keymap("n", "<C-Right>", ":vertical resize +2<CR>", opts)

-- Status Bar
keymap("n", "<leader>c", ":Bdelete<CR>", opts)
keymap("n", "]b", "<Cmd>BufferLineCycleNext<CR>", opts)
keymap("n", "[b", "<Cmd>BufferLineCyclePrev<CR>", opts)
keymap("n", "<S-l>", ":BufferLineCycleNext<CR>", opts)
keymap("n", "<S-h>", ":BufferLineCyclePrev<CR>", opts)
keymap("n", "<leader>be", "<cmd>lua require('rielj.bufferline').close_except_current()<CR>", opts)

-- Comment
-- keymap("n", "<leader>/", "<cmd>lua require('Comment.api').toggle_current_linewise()<CR>", opts)
-- keymap("v", "<leader>/", "<ESC><cmd>lua require('Comment.api').toggle_linewise_op(vim.fn.visualmode())<CR>", opts)

-- Telescope --
-- keymap(
--   "n",
--   "<leader>f",
--   "<cmd>lua require'telescope.builtin'.find_files(require('telescope.themes').get_dropdown({ previewer = false }))<cr>",
--   opts
-- )
-- keymap("n", "<leader>st", "<cmd>Telescope live_grep<cr>", opts)

-- For Escaping
keymap("i", "jk", "<ESC>", opts)
keymap("i", "<C-c>", "<ESC>", opts)
keymap("v", "<C-c>", "<ESC>", opts)

-- Visual --
-- Stay in indent mode
keymap("v", "<", "<gv", opts)
keymap("v", ">", ">gv", opts)

-- Move text up and down
keymap("n", "<A-j>", ":m .+1<CR>==", opts)
keymap("n", "<A-k>", ":m .-2<CR>==", opts)
keymap("v", "<A-j>", ":m .+1<CR>==", opts)
keymap("v", "<A-k>", ":m .-2<CR>==", opts)
keymap("v", "p", '"_dP', opts)

-- Visual Block --
-- Move text up and down
keymap("x", "J", ":move '>+1<CR>gv-gv", opts)
keymap("x", "K", ":move '<-2<CR>gv-gv", opts)
keymap("x", "<A-j>", ":move '>+1<CR>gv-gv", opts)
keymap("x", "<A-k>", ":move '<-2<CR>gv-gv", opts)

-- Add Oneline before and stay in normal mode
keymap("n", "<leader>o", "o<ESC>", opts)

-- NvimTree
keymap("n", "<leader>e", ":NvimTreeToggle<CR>", opts)

-- The Primeagean top 5 remaps
-- #1
keymap("n", "Y", "y$", opts)

-- #2
keymap("n", "n", "nzzzv", opts)
keymap("n", "N", "Nzzzv", opts)
keymap("n", "J", "mzJ`z", opts)

-- #3
keymap("i", ",", ",<C-g>u", opts)
keymap("i", ".", ".<C-g>u", opts)
keymap("i", "(", "(<C-g>u", opts)
keymap("i", "!", "!<C-g>u", opts)
keymap("i", "?", "?<C-g>u", opts)

-- #4
keymap("n", "<expr>", 'k (v:count > 5 ? "m\'" . v:count : "" . \'k\'', opts)
keymap("n", "<expr>", 'h (v:count > 5 ? "m\'" . v:count : "" . \'j\'', opts)

-- #5
keymap("v", "J", ">+1<CR>gv=gv", opts)
keymap("v", "K", "<-2<CR>gv=gv", opts)
