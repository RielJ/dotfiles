return {
  {
    "olexsmir/gopher.nvim",
    ft = { "go", "gomod", "gowork", "gotmpl" },
    dependencies = {
      "nvim-lua/plenary.nvim",
      "nvim-treesitter/nvim-treesitter",
    },
    -- `build` was previously a table containing `vim.cmd([[silent! GoInstallDeps]])`,
    -- which runs while the spec is being *parsed* — i.e. on every startup, not
    -- on install. A string build runs through lazy, on install/update only.
    build = ":GoInstallDeps",
    opts = {},
  },
}
