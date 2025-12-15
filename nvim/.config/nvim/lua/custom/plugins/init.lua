return {
  {
    {
      "lewis6991/impatient.nvim",
      config = function()
        require("impatient")
        require("impatient").enable_profile()
      end,
    },

    {
      "nvim-tree/nvim-web-devicons",
      lazy = true,
      opts = {},
    },

    "godlygeek/tabular", -- Quickly align text by pattern
    -- TPOPE
    "tpope/vim-abolish", -- Cool things with words!
    "tpope/vim-surround",
    "tpope/vim-fugitive",
    "tpope/vim-rhubarb",
    "tpope/vim-unimpaired",
    "tpope/vim-characterize", -- ?
    "tpope/vim-scriptease",
    "tpope/vim-repeat",
    "tpope/vim-sleuth", -- detects indentation
    "kevinhwang91/nvim-bqf",
    -- log highlighter
    { "mtdl9/vim-log-highlighting", ft = { "text", "log" } },
  },
}
