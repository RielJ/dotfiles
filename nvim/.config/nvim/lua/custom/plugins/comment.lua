return {
  {
    {
      "numToStr/Comment.nvim",
      dependencies = { "JoosepAlviste/nvim-ts-context-commentstring" },
    },
    {
      "folke/todo-comments.nvim",
      dependencies = "nvim-lua/plenary.nvim",
      event = "BufRead",
    },
  },
}
