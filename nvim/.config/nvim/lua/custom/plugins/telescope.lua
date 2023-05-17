return {
  {
    -- Telescope
    "nvim-lua/popup.nvim",
    "nvim-lua/plenary.nvim",
    {
      "nvim-telescope/telescope.nvim",
      tag = "0.1.1",
      priority = 100,
      config = function()
        require("rielj.telescope.setup")
        require("rielj.telescope.keys")
      end,
    },
    "nvim-telescope/telescope-file-browser.nvim",
    {
      "nvim-telescope/telescope-fzf-native.nvim",
      build = "make",
    },
  },
}
