return {
  {
    -- Markdown Preview
    {
      "iamcco/markdown-preview.nvim",
      build = "cd app && npm install",
      ft = "markdown",
    },
    { "ellisonleao/glow.nvim", branch = "main", ft = "markdown" },
    {
      "MeanderingProgrammer/render-markdown.nvim",
      dependencies = { "nvim-treesitter/nvim-treesitter", "nvim-tree/nvim-web-devicons" },
      ft = "markdown",
    },
  },
}
