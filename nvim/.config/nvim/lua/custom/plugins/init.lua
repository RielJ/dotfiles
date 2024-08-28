return {
  {
    {
      "lewis6991/impatient.nvim",
      config = function()
        require("impatient")
        require("impatient").enable_profile()
      end,
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

    -- {
    --   "glacambre/firenvim",
    --   cond = not not vim.g.started_by_firenvim,
    --   build = function()
    --     require("lazy").load({ plugins = { "firenvim" }, wait = true })
    --     vim.fn["firenvim#install"](0)
    --   end,
    -- },
  },
}
