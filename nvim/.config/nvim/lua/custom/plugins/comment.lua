-- Comment.nvim and nvim-ts-context-commentstring both retired here: Neovim's
-- built-in commenting covers `gc`/`gcc`, dot-repeat and treesitter-driven
-- 'commentstring' (verified producing `{/* … */}` inside JSX). The one gap,
-- blank lines inside a commented block, is handled by lua/rielj/comment.lua.
return {
  {
    "folke/todo-comments.nvim",
    dependencies = "nvim-lua/plenary.nvim",
    event = "BufRead",
  },
}
