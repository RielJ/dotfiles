vim.api.nvim_set_keymap("n", "<leader>", "<NOP>", { noremap = true, silent = true })

-- The Primeagean top 5 remaps
-- #1
vim.api.nvim_set_keymap("n", "Y", "y$", { silent = true, noremap = true })

-- #2
vim.api.nvim_set_keymap("n", "n", "nzzzv", { silent = true, noremap = true })
vim.api.nvim_set_keymap("n", "N", "Nzzzv", { silent = true, noremap = true })
vim.api.nvim_set_keymap("n", "J", "mzJ`z", { silent = true, noremap = true })

-- #3
vim.api.nvim_set_keymap("i", ",", ",<C-g>u", { silent = true, noremap = true })
vim.api.nvim_set_keymap("i", ".", ".<C-g>u", { silent = true, noremap = true })
vim.api.nvim_set_keymap("i", "(", "(<C-g>u", { silent = true, noremap = true })
vim.api.nvim_set_keymap("i", "!", "!<C-g>u", { silent = true, noremap = true })
vim.api.nvim_set_keymap("i", "?", "?<C-g>u", { silent = true, noremap = true })

-- #4
vim.api.nvim_set_keymap(
  "n",
  "<expr>",
  'k (v:count > 5 ? "m\'" . v:count : "" . \'k\'',
  { silent = true, noremap = true }
)
vim.api.nvim_set_keymap(
  "n",
  "<expr>",
  'h (v:count > 5 ? "m\'" . v:count : "" . \'j\'',
  { silent = true, noremap = true }
)

-- #5
vim.api.nvim_set_keymap("v", "J", ">+1<CR>gv=gv", { noremap = true, silent = true })
vim.api.nvim_set_keymap("v", "K", "<-2<CR>gv=gv", { noremap = true, silent = true })

-- better window movement
vim.api.nvim_set_keymap("n", "<C-h>", "<C-w>h", { silent = true })
vim.api.nvim_set_keymap("n", "<C-j>", "<C-w>j", { silent = true })
vim.api.nvim_set_keymap("n", "<C-k>", "<C-w>k", { silent = true })
vim.api.nvim_set_keymap("n", "<C-l>", "<C-w>l", { silent = true })

-- Status Bar
vim.api.nvim_set_keymap("n", "<leader>c", ":BufferClose<CR>", { noremap = true, silent = true })
vim.api.nvim_set_keymap("n", "]b", ":BufferNext<CR>", { noremap = true, silent = true })
vim.api.nvim_set_keymap("n", "[b", ":BufferPrevious<CR>", { noremap = true, silent = true })

-- For Escaping
vim.api.nvim_set_keymap("i", "jk", "<ESC>", { noremap = true, silent = true })
vim.api.nvim_set_keymap("i", "<C-c>", "<ESC>", { noremap = true, silent = true })
vim.api.nvim_set_keymap("v", "<C-c>", "<ESC>", { noremap = true, silent = true })

-- Add Oneline before and stay in normal mode
vim.api.nvim_set_keymap("n", "<leader>o", "o<ESC>", { noremap = true, silent = true })

-- vim.api.nvim_set_keymap("n", "<leader>f", ":Telescope git_files<cr>", { noremap = true, silent = true })
vim.api.nvim_set_keymap("n", "<leader>f", ":Telescope find_files<cr>", { noremap = true, silent = true })

-- NvimTree
vim.api.nvim_set_keymap("n", "<Leader>e", ":NvimTreeToggle<CR>", { noremap = true, silent = true })
