return {
  {
    {
      "olexsmir/gopher.nvim",
      requires = { -- dependencies
        "nvim-lua/plenary.nvim",
        "nvim-treesitter/nvim-treesitter",
      },
      config = function()
        require("gopher").setup()
      end,
      build = {
        vim.cmd [[silent! GoInstallDeps]]
      }
    },
  },
}
