return {
  {
    {
      "windwp/nvim-ts-autotag",
      config = function()
        require("nvim-ts-autotag").setup()
      end,
      ft = { "typescript", "typescriptreact", "vue" },
    }, -- automatically close jsx tags
    -- Autopairs
    {
      "windwp/nvim-autopairs",
      -- event = "InsertEnter",
      config = function()
        local autopairs = require "nvim-autopairs"
        local config = {
          active = true,
          on_config_done = nil,
          ---@usage  -- modifies the function or method delimiter by filetypes
          map_char = {
            all = "(",
            tex = "{",
          },
          ---@usage check bracket in same line
          enable_check_bracket_line = false,
          ---@usage check treesitter
          check_ts = true,
          ts_config = {
            lua = { "string", "source" },
            javascript = { "string", "template_string" },
            java = false,
          },
          disable_filetype = { "TelescopePrompt", "spectre_panel" },
          ignored_next_char = string.gsub([[ [%w%%%'%[%"%.] ]], "%s+", ""),
          enable_moveright = true,
          ---@usage disable when recording or executing a macro
          disable_in_macro = false,
          ---@usage add bracket pairs after quote
          enable_afterquote = true,
          ---@usage map the <BS> key
          map_bs = true,
          ---@usage map <c-w> to delete a pair if possible
          map_c_w = false,
          ---@usage disable when insert after visual block mode
          disable_in_visualblock = false,
          ---@usage  change default fast_wrap
          fast_wrap = {
            map = "<M-e>",
            chars = { "{", "[", "(", '"', "'" },
            pattern = string.gsub([[ [%'%"%)%>%]%)%}%,] ]], "%s+", ""),
            offset = 0, -- Offset from pattern match
            end_key = "$",
            keys = "qwertyuiopzxcvbnmasdfghjkl",
            check_comma = true,
            highlight = "Search",
            highlight_grey = "Comment",
          },
        }

        autopairs.setup {
          check_ts = config.check_ts,
          ts_config = config.ts_config,
          enable_check_bracket_line = config.enable_check_bracket_line,
          disable_filetype = config.disable_filetype,
          disable_in_macro = config.disable_in_macro,
          ignored_next_char = config.ignored_next_char,
          enable_moveright = config.enable_moveright,
          enable_afterquote = config.enable_afterquote,
          map_c_w = config.map_c_w,
          map_bs = config.map_bs,
          disable_in_visualblock = config.disable_in_visualblock,
          fast_wrap = config.fast_wrap,
        }

        local cmp_status_ok, cmp = pcall(require, "cmp")
        if cmp_status_ok then
          -- If you want insert `(` after select function or method item
          local cmp_autopairs = require "nvim-autopairs.completion.cmp"
          local map_char = config.map_char
          cmp.event:on("confirm_done", cmp_autopairs.on_confirm_done { map_char = map_char })
        end

        require("nvim-treesitter.configs").setup { autopairs = { enable = true } }

        -- local ts_conds = require "nvim-autopairs.ts-conds"

        -- TODO: can these rules be safely added from "config.lua" ?
        -- press % => %% is only inside comment or string
        -- autopairs.add_rules {
        --   Rule("%", "%", "lua"):with_pair(ts_conds.is_ts_node { "string", "comment" }),
        --   Rule("$", "$", "lua"):with_pair(ts_conds.is_not_ts_node { "function" }),
        -- }
      end,
    },
  },
}
