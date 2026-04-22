return {
  {
    "dmtrKovalenko/fff.nvim",
    build = function()
      require("fff.download").download_or_build_binary()
    end,
    opts = {
      frecency = {
        enabled = true,
      },
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
        move_up = { "<Up>", "<C-k>", "<C-p>", "<Tab>" },
        move_down = { "<Down>", "<C-j>", "<C-n>" },
        preview_scroll_up = "<C-u>",
        preview_scroll_down = "<C-d>",
        send_to_quickfix = "<C-q>",
      },
    },
    lazy = false,
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
