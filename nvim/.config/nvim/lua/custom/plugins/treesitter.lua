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
    -- Dim
    {
      "narutoxy/dim.lua",
      dependencies = { "nvim-treesitter/nvim-treesitter", "neovim/nvim-lspconfig" },
      opts = {},
    },
  },
}
