return {
  {
    -- TreeSitter
    {
      "nvim-treesitter/nvim-treesitter",
      build = ":TSUpdate",
    },
    {
      "nvim-treesitter/nvim-treesitter-textobjects",
      dependencies = "nvim-treesitter/nvim-treesitter",
    },
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
