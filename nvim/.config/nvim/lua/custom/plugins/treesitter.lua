return {
  {
    -- TreeSitter (main branch: legacy modules API removed; uses vim.treesitter natively)
    {
      "nvim-treesitter/nvim-treesitter",
      branch = "main",
      build = ":TSUpdate",
      -- `playground` is archived; Neovim ships `:InspectTree` since 0.9.
      -- `nvim-treesitter-textobjects` targets the legacy `master` modules API.
      -- Re-enable manually once you migrate its keymaps to query-based selection.
      -- dependencies = {
      --   "nvim-treesitter/nvim-treesitter-textobjects",
      -- },
    },
    "nvim-treesitter/nvim-treesitter-context",
    "JoosepAlviste/nvim-ts-context-commentstring",
    -- {
    --   "nvim-treesitter/nvim-treesitter-angular",
    --   dependencies = "nvim-treesitter/nvim-treesitter",
    -- },
    -- Dim
    -- { "elgiano/nvim-treesitter-angular", branch = "topic/jsx-fix" },
    {
      "narutoxy/dim.lua",
      dependencies = { "nvim-treesitter/nvim-treesitter", "neovim/nvim-lspconfig" },
      opts = {},
    },
  },
}
