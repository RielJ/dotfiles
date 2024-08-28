require("gitsigns").setup({
  signs = {
    add = { text = "▎" },
    change = { text = "▎" },
    delete = { text = "" },
    topdelete = { text = "" },
    changedelete = { text = "▎" },
    untracked = { text = "▎" },
  },
  signs_staged = {
    add = { text = "▎" },
    change = { text = "▎" },
    delete = { text = "" },
    topdelete = { text = "" },
    changedelete = { text = "▎" },
  },
  numhl = false,
  linehl = false,
  -- keymaps = {
  --   -- Default keymap options
  --   noremap = true,
  --   buffer = true,
  -- },
  watch_gitdir = {
    interval = 1000,
    follow_files = true,
  },
  current_line_blame = false, -- Toggle with `:Gitsigns toggle_current_line_blame`
  current_line_blame_opts = {
    virt_text = true,
    virt_text_pos = "eol", -- 'eol' | 'overlay' | 'right_align'
    delay = 1000,
    ignore_whitespace = false,
  },
  sign_priority = 6,
  update_debounce = 200,
  status_formatter = nil, -- Use default
  max_file_length = 40000,
  preview_config = {
    -- Options passed to nvim_open_win
    border = "single",
    style = "minimal",
    relative = "cursor",
    row = 0,
    col = 1,
  },
  on_attach = function(bufnr)
    local gs = package.loaded.gitsigns

    local function map(mode, l, r, desc)
      local des = desc or ""
      vim.keymap.set(mode, l, r, { buffer = bufnr, desc = des })
    end

    -- Navigation
    map("n", "gj", function()
      if vim.wo.diff then
        return "gj"
      end
      vim.schedule(function()
        gs.next_hunk()
      end)
      return "<Ignore>"
    end, "Next Hunk")

    map("n", "gk", function()
      if vim.wo.diff then
        return "gk"
      end
      vim.schedule(function()
        gs.prev_hunk()
      end)
      return "<Ignore>"
    end, "Prev Hunk")

    -- Actions
    -- map("n", "<leader>hs", gs.stage_hunk)
    map("n", "<leader>gr", gs.reset_hunk)
    -- map("v", "<leader>hs", function()
    --   gs.stage_hunk({ vim.fn.line("."), vim.fn.line("v") })
    -- end)
    -- map("v", "<leader>hr", function()
    --   gs.reset_hunk({ vim.fn.line("."), vim.fn.line("v") })
    -- end)
    -- map("n", "<leader>hS", gs.stage_buffer)
    -- map("n", "<leader>hu", gs.undo_stage_hunk)
    -- map("n", "<leader>hR", gs.reset_buffer)
    map("n", "<leader>gp", gs.preview_hunk)
    -- map("n", "<leader>hb", function()
    --   gs.blame_line({ full = true })
    -- end)
    -- map("n", "<leader>tb", gs.toggle_current_line_blame)
    -- map("n", "<leader>hd", gs.diffthis)
    -- map("n", "<leader>hD", function()
    --   gs.diffthis("~")
    -- end)
    -- map("n", "<leader>td", gs.toggle_deleted)

    -- Text object
    -- map({ "o", "x" }, "ih", ":<C-U>Gitsigns select_hunk<CR>")
  end,
})
