require("Comment").setup({
  -- ignores empty lines
  ignore = "^$",
  pre_hook = require("ts_context_commentstring.integrations.comment_nvim").create_pre_hook(),
  -- pre_hook = require("ts_context_commentstring.integrations.comment_nvim").create_pre_hook(),
  sticky = true,
  padding = true,
  -- LHS of operator-pending mapping in NORMAL + VISUAL mode
  opleader = {
    -- line-comment keymap
    line = "gc",
    -- block-comment keymap
    block = "gb",
  },

  -- Create basic (operator-pending) and extended mappings for NORMAL + VISUAL mode
  mappings = {
    -- operator-pending mapping
    -- Includes:
    --  `gcc`               -> line-comment  the current line
    --  `gcb`               -> block-comment the current line
    --  `gc[count]{motion}` -> line-comment  the region contained in {motion}
    --  `gb[count]{motion}` -> block-comment the region contained in {motion}
    basic = true,
    -- extra mapping
    -- Includes `gco`, `gcO`, `gcA`
    extra = true,
  },

  -- LHS of toggle mapping in NORMAL + VISUAL mode
  toggler = {
    -- line-comment keymap
    --  Makes sense to be related to your opleader.line
    line = "gcc",
    -- block-comment keymap
    --  Make sense to be related to your opleader.block
    block = "gbc",
  },
})

local comment_ft = require("Comment.ft")
comment_ft.set("lua", { "--%s", "--[[%s]]" })

require("todo-comments").setup({
  highlight = { max_line_len = 120 },
  colors = {
    error = { "DiagnosticError" },
    warning = { "DiagnosticWarn" },
    info = { "DiagnosticInfo" },
    hint = { "DiagnosticHint" },
    hack = { "Function" },
    ref = { "FloatBorder" },
    default = { "Identifier" },
  },
})
