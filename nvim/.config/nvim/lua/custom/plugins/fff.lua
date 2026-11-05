return {
  {
    "dmtrKovalenko/fff",
    name = "fff.nvim",
    version = "v0.10.5",
    -- Build from source instead of downloading the release binary. Releases use
    -- the zlob walker, which reads only .gitignore files and skips global
    -- excludes (~/.config/git/ignore), .git/info/exclude and .ignore, so
    -- globally ignored dirs like .pi/ leak into the picker. The default cargo
    -- features select the ripgrep walker, which honours all of them; its file
    -- watcher falls back to libgit2, which honours them too.
    build = "cargo build --release",
    opts = {
      frecency = {
        enabled = true,
      },
      wrap_around = true,
      debug = {
        enabled = false,
        show_scores = false,
      },
      layout = {
        height = 0.8,
        width = 0.8,
        prompt_position = "bottom",
        preview_position = "right",
        preview_size = 0.5,
      },
      keymaps = {
        close = "<Esc>",
        select = "<CR>",
        select_split = "<C-x>",
        select_vsplit = "<C-v>",
        select_tab = "<C-t>",
        move_up = { "<Up>", "<C-k>", "<Tab>" },
        move_down = { "<Down>", "<C-j>", "<S-Tab>" },
        preview_scroll_up = "<C-u>",
        preview_scroll_down = "<C-d>",
        cycle_grep_modes = "<C-g>",
        toggle_select = "<C-s>",
        send_to_quickfix = "<C-q>",
      },
    },
    keys = {
      {
        "<leader>fd",
        function()
          require("fff").find_files()
        end,
        desc = "fff: Find files",
      },
      {
        "<leader>st",
        function()
          require("fff").live_grep()
        end,
        desc = "fff: Live grep",
      },
    },
  },
}
