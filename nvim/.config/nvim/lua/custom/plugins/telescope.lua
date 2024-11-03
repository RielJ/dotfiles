return {
  {
    -- Telescope
    "nvim-lua/popup.nvim",
    "nvim-lua/plenary.nvim",
    {
      "nvim-telescope/telescope.nvim",
      priority = 100,
      config = function()
        require("rielj.telescope.setup")
        require("rielj.telescope.keys")
      end,
    },
    "nvim-telescope/telescope-file-browser.nvim",
    -- "nvim-telescope/telescope-frecency.nvim",
    {
      "nvim-telescope/telescope-fzf-native.nvim",
      build = "make",
    },
    "dharmx/telescope-media.nvim",
  },
}
