local map_tele = require "rielj.telescope.mappings"

-- Dotfiles
-- map_tele("<leader>en", "edit_neovim")
-- map_tele("<leader>ez", "edit_zsh")
map_tele("<leader><leader>d", "diagnostics")

-- Files
-- map_tele("<space>ft", "git_files")
-- map_tele("<space>fg", "multi_rg")
-- map_tele("<space>fo", "oldfiles")
-- map_tele("<space>fd", "find_files")
-- map_tele("<space>fs", "fs")
map_tele("<leader>pp", "project_search")
-- map_tele("<space>fv", "find_nvim_source")
-- map_tele("<space>fe", "file_browser")
-- map_tele("<space>fz", "search_only_certain_files")

-- Git
map_tele("<leader>gs", "git_status")
map_tele("<leader>gc", "git_commits")
-- keymap("n", "<leader>sb", "<cmd>Telescope git_branches<cr>", opts)
-- keymap("n", "<leader>sf", "<cmd>Telescope find_files<cr>", opts)
-- keymap("n", "<leader>sr", "<cmd>Telescope oldfiles<cr>", opts)
-- keymap("n", "<leader>sR", "<cmd>Telescope registers<cr>", opts)
