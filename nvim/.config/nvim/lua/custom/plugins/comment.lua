return {
  {
    -- Comment
    {
      "numToStr/Comment.nvim",
      config = function()
        require("Comment").setup {
          pre_hook = require("ts_context_commentstring.integrations.comment_nvim").create_pre_hook(),
          padding = true,
          ignore = "^$",
        }
      end,
      dependencies = { "JoosepAlviste/nvim-ts-context-commentstring" },
    },
    {
      "folke/todo-comments.nvim",
      dependencies = "nvim-lua/plenary.nvim",
      config = function()
        local _, todo = pcall(require, "todo-comments")
        local icons = {
          FIX = "律",
          TODO = " ",
          HACK = " ",
          WARN = "裂",
          PERF = "龍",
          NOTE = " ",
          ERROR = " ",
          REFS = "",
        }
        todo.setup {
          keywords = {
            FIX = { icon = icons.FIX },
            TODO = { icon = icons.TODO, alt = { "WIP" } },
            HACK = { icon = icons.HACK, color = "hack" },
            WARN = { icon = icons.WARN },
            PERF = { icon = icons.PERF },
            NOTE = { icon = icons.NOTE, alt = { "INFO", "NB" } },
            ERROR = { icon = icons.ERROR, color = "error", alt = { "ERR" } },
            REFS = { icon = icons.REFS },
          },
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
        }
      end,
      event = "BufRead",
    },
  },
}
