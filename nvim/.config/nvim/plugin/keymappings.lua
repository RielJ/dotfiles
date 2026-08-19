-- Global keymaps. Everything goes through rielj.keymap so collisions are
-- detected at startup (:KeymapCollisions) instead of at keypress.
--
-- Buffer-local maps live with the thing that owns them: LSP maps in
-- rielj.lsp.handlers, TypeScript maps in rielj.ts-tools, plugin maps in the
-- plugin's own spec.

local map = require("rielj.keymap").map

-- Window movement --
map("n", "<C-h>", "<C-w>h", { desc = "Window left" })
map("n", "<C-j>", "<C-w>j", { desc = "Window down" })
map("n", "<C-k>", "<C-w>k", { desc = "Window up" })
map("n", "<C-l>", "<C-w>l", { desc = "Window right" })

-- Resize with arrows --
map("n", "<C-Up>", "<cmd>resize +2<CR>", { desc = "Resize taller" })
map("n", "<C-Down>", "<cmd>resize -2<CR>", { desc = "Resize shorter" })
map("n", "<C-Left>", "<cmd>vertical resize -2<CR>", { desc = "Resize narrower" })
map("n", "<C-Right>", "<cmd>vertical resize +2<CR>", { desc = "Resize wider" })

-- LSP --
map("n", "<leader>la", vim.lsp.buf.code_action, { desc = "Code action" })
map("n", "<leader>lA", vim.lsp.codelens.run, { desc = "Run codelens" })
map("n", "<leader>lt", function()
  require("rielj.lsp.handlers").apply_all_tailwind_actions_buffer()
end, { desc = "Tailwind: fix buffer" })
map("n", "<leader>lT", function()
  require("rielj.lsp.handlers").apply_all_tailwind_actions()
end, { desc = "Tailwind: fix line" })
map("n", "<leader>ld", "<cmd>Telescope diagnostics bufnr=0 theme=get_ivy<cr>", { desc = "Buffer diagnostics" })
map("n", "<leader>lw", "<cmd>Telescope diagnostics<cr>", { desc = "Workspace diagnostics" })
map("n", "<leader>lj", function()
  vim.diagnostic.jump({ count = 1, float = true })
end, { desc = "Next diagnostic" })
map("n", "<leader>lk", function()
  vim.diagnostic.jump({ count = -1, float = true })
end, { desc = "Previous diagnostic" })
map("n", "<leader>ll", vim.diagnostic.open_float, { desc = "Line diagnostics" })
map("n", "<leader>lq", vim.diagnostic.setloclist, { desc = "Diagnostics to loclist" })
map("n", "<leader>ls", "<cmd>Telescope lsp_document_symbols<cr>", { desc = "Document symbols" })
map("n", "<leader>lS", "<cmd>Telescope lsp_dynamic_workspace_symbols<cr>", { desc = "Workspace symbols" })
map("n", "<leader>le", "<cmd>Telescope quickfix<cr>", { desc = "Quickfix list" })
map("n", "<leader>lpd", function()
  require("rielj.lsp.peek").Peek("definition")
end, { desc = "Peek definition" })
map("n", "<leader>lpt", function()
  require("rielj.lsp.peek").Peek("typeDefinition")
end, { desc = "Peek type definition" })
map("n", "<leader>lpi", function()
  require("rielj.lsp.peek").Peek("implementation")
end, { desc = "Peek implementation" })
map("n", "<leader>h", function()
  vim.lsp.inlay_hint.enable(not vim.lsp.inlay_hint.is_enabled())
  vim.notify("LSP inlay hints " .. (vim.lsp.inlay_hint.is_enabled() and "enabled" or "disabled"))
end, { desc = "Toggle inlay hints" })

-- Buffers --
map("n", "<leader>bf", "<cmd>Telescope buffers<cr>", { desc = "Find buffer" })
map("n", "<leader>c", function()
  require("mini.bufremove").delete(0, false)
end, { desc = "Close buffer" })
map("n", "]b", "<cmd>BufferLineCycleNext<CR>", { desc = "Next buffer" })
map("n", "[b", "<cmd>BufferLineCyclePrev<CR>", { desc = "Previous buffer" })
map("n", "<S-l>", "<cmd>BufferLineCycleNext<CR>", { desc = "Next buffer" })
map("n", "<S-h>", "<cmd>BufferLineCyclePrev<CR>", { desc = "Previous buffer" })
map("n", "<leader>be", function()
  require("rielj.bufferline").close_except_current()
end, { desc = "Close other buffers" })

-- Search --
map("n", "<leader>sb", "<cmd>Telescope git_branches<cr>", { desc = "Git branches" })
map("n", "<leader>sf", "<cmd>Telescope find_files<cr>", { desc = "Find files" })
map("n", "<leader>sr", "<cmd>Telescope oldfiles<cr>", { desc = "Recent files" })
map("n", "<leader>sR", "<cmd>Telescope registers<cr>", { desc = "Registers" })

-- Git --
map("n", "<leader>gj", function()
  require("gitsigns").nav_hunk("next")
end, { desc = "Next hunk" })
map("n", "<leader>gk", function()
  require("gitsigns").nav_hunk("prev")
end, { desc = "Previous hunk" })
map("n", "<leader>gp", function()
  require("gitsigns").preview_hunk()
end, { desc = "Preview hunk" })
map("n", "<leader>gr", function()
  require("gitsigns").reset_hunk()
end, { desc = "Reset hunk" })
map("n", "<leader>gs", "<cmd>Telescope git_status<CR>", { desc = "Git status" })
map("n", "<leader>gb", "<cmd>Telescope git_branches<CR>", { desc = "Git branches" })

-- Terminal --
map("t", "<C-h>", "<C-\\><C-N><C-w>h", { desc = "Window left" })
map("t", "<C-j>", "<C-\\><C-N><C-w>j", { desc = "Window down" })
map("t", "<C-k>", "<C-\\><C-N><C-w>k", { desc = "Window up" })
map("t", "<C-l>", "<C-\\><C-N><C-w>l", { desc = "Window right" })
map("n", "<leader>lg", function()
  require("rielj.terminal")._lazygit_toggle()
end, { desc = "Lazygit" })

-- Spectre --
map("n", "<leader>rf", function()
  require("spectre").open_file_search()
end, { desc = "Search/replace in file" })
map("n", "<leader>rp", function()
  require("spectre").open()
end, { desc = "Search/replace in project" })
map("n", "<leader>rw", function()
  require("spectre").open_visual({ select_word = true })
end, { desc = "Search/replace word" })

-- Trees & UI --
map("n", "<leader>e", "<cmd>NvimTreeToggle<CR>", { desc = "File tree" })
map("n", "<leader>db", "<cmd>DBUIToggle<CR>", { desc = "Database UI" })

-- Escaping --
map("i", "jk", "<ESC>", { desc = "Escape" })
map({ "i", "v" }, "<C-c>", "<ESC>", { desc = "Escape" })

-- Visual: stay in indent mode --
map("v", "<", "<gv", { desc = "Outdent" })
map("v", ">", ">gv", { desc = "Indent" })
map("v", "p", '"_dP', { desc = "Paste without yanking" })

-- Move text up and down --
map("n", "<A-j>", "<cmd>m .+1<CR>==", { desc = "Move line down" })
map("n", "<A-k>", "<cmd>m .-2<CR>==", { desc = "Move line up" })
map("x", "J", ":move '>+1<CR>gv=gv", { desc = "Move selection down" })
map("x", "K", ":move '<-2<CR>gv=gv", { desc = "Move selection up" })
map("x", "<A-j>", ":move '>+1<CR>gv=gv", { desc = "Move selection down" })
map("x", "<A-k>", ":move '<-2<CR>gv=gv", { desc = "Move selection up" })

-- Add a line below, stay in normal mode --
map("n", "<leader>o", "o<ESC>", { desc = "Blank line below" })

-- Keep the cursor centred / undo-break points --
map("n", "Y", "y$", { desc = "Yank to end of line" })
map("n", "n", "nzzzv", { desc = "Next search result" })
map("n", "N", "Nzzzv", { desc = "Previous search result" })
map("n", "J", "mzJ`z", { desc = "Join lines, keep cursor" })
map("i", ",", ",<C-g>u", { desc = "Undo break point" })
map("i", ".", ".<C-g>u", { desc = "Undo break point" })
map("i", "(", "(<C-g>u", { desc = "Undo break point" })
map("i", "!", "!<C-g>u", { desc = "Undo break point" })
map("i", "?", "?<C-g>u", { desc = "Undo break point" })

-- Add large j/k jumps to the jumplist so <C-o> can walk them back --
map("n", "k", function()
  return vim.v.count > 5 and "m'" .. vim.v.count .. "k" or "k"
end, { expr = true, desc = "Up (jumplist-aware)" })
map("n", "j", function()
  return vim.v.count > 5 and "m'" .. vim.v.count .. "j" or "j"
end, { expr = true, desc = "Down (jumplist-aware)" })

-- Copy file path with line number for OpenCode --
map("n", "<leader>cs", function()
  local text = "@" .. vim.fn.expand("%:.") .. ":" .. vim.fn.line(".")
  vim.fn.setreg("+", text)
  vim.notify("Copied: " .. text, vim.log.levels.INFO)
end, { desc = "Copy file path with line number" })

-- Restart Neovim and reopen the current buffer --
local restart_file_path = vim.fn.stdpath("cache") .. "/restart_session.txt"

map("n", "<leader>R", function()
  local file = vim.fn.expand("%:p")
  local line = vim.fn.line(".")
  vim.cmd("silent! wa")
  local f = io.open(restart_file_path, "w")
  if f then
    f:write(file .. "\n" .. line)
    f:close()
  end
  vim.cmd("restart")
end, { desc = "Restart Neovim and reopen buffer" })

vim.api.nvim_create_autocmd("VimEnter", {
  callback = function()
    local f = io.open(restart_file_path, "r")
    if not f then
      return
    end
    local content = f:read("*all")
    f:close()
    os.remove(restart_file_path)
    local lines = vim.split(content, "\n")
    local file = lines[1]
    local line = tonumber(lines[2]) or 1
    if file and file ~= "" and vim.fn.filereadable(file) == 1 then
      vim.schedule(function()
        vim.cmd("edit " .. vim.fn.fnameescape(file))
        vim.api.nvim_win_set_cursor(0, { line, 0 })
      end)
    end
  end,
})
