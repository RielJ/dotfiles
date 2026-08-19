return {
  {
    "Saecki/crates.nvim",
    -- Only ever active in Cargo.toml.
    ft = "toml",
    config = function()
      require("crates").setup()
    end,
  },
  -- {
  --   "simrat39/rust-tools.nvim",
  -- },
  -- {
  --   'mrcjkb/rustaceanvim',
  --   version = '^5', -- Recommended
  --   lazy = false,   -- This plugin is already lazy
  -- }
}
