return {
  {
    -- Markdown Preview
    {
      "iamcco/markdown-preview.nvim",
      build = "cd app && npm install",
      ft = "markdown",
    },
    { "ellisonleao/glow.nvim", branch = "main", ft = "markdown" },
  },
}
