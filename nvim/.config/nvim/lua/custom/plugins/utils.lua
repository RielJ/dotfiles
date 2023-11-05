return {
  {
    -- Presence
    {
      "andweeb/presence.nvim",
      enabled = true,
    },
    -- {
    --   "AckslD/nvim-neoclip.lua",
    --   opts = {},
    --   dependencies = { "kkharji/sqlite.lua", module = "sqlite" },
    -- },

    -- hlslens
    {
      "kevinhwang91/nvim-hlslens",
      event = "BufReadPost",
    },

    -- Matchup
    {
      "andymass/vim-matchup",
      -- event = "BufReadPost",
      config = function()
        vim.g.matchup_enabled = 1
        vim.g.matchup_surround_enabled = 1
        -- vim.g.matchup_matchparen_deferred = 1
        vim.g.matchup_matchparen_offscreen = { method = "popup" }
      end,
    },

    -- Cheatsheet
    {
      "RishabhRD/nvim-cheat.sh",
      dependencies = "RishabhRD/popfix",
      lazy = true,
      config = function()
        vim.g.cheat_default_window_layout = "vertical_split"
      end,
      cmd = { "Cheat", "CheatWithoutComments", "CheatList", "CheatListWithoutComments" },
      keys = "<leader>?",
    },
  },
}
