return {
  { "nvim-lua/plenary.nvim", lazy = true },
  {
    "nvim-telescope/telescope.nvim",
    priority = 100,
    -- Not `keys`: rielj.telescope.keys installs ~25 mappings through map_tele,
    -- and duplicating that list here would be a second source of truth. Not
    -- `cmd = "Telescope"` either -- half the entry points are Lua callbacks
    -- rather than the :Telescope command. VeryLazy still gets it off the
    -- startup path: the UI paints first.
    event = "VeryLazy",
    dependencies = {
      "nvim-lua/plenary.nvim",
      "nvim-telescope/telescope-file-browser.nvim",
      { "nvim-telescope/telescope-fzf-native.nvim", build = "make" },
    },
    config = function()
      require("rielj.telescope.setup")
      require("rielj.telescope.keys")
    end,
  },
  { "nvim-telescope/telescope-file-browser.nvim", lazy = true },
}
