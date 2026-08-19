return {
  {
    "kevinhwang91/nvim-hlslens",
    -- The lens only appears once a search is running; these are exactly the
    -- keys whose mappings the config below installs.
    keys = { "n", "N", "*", "#", "g*", "g#" },
    config = function()
      local _, hlslens = pcall(require, "hlslens")
      hlslens.setup({
        auto_enable = true,
        calm_down = true,
        enable_incsearch = false,
        nearest_only = false,

        override_lens = function(render, posList, nearest, idx, relIdx)
          local sfw = vim.v.searchforward == 1
          local indicator, text, chunks
          local absRelIdx = math.abs(relIdx)
          if absRelIdx > 1 then
            indicator = ("%d%s"):format(absRelIdx, sfw ~= (relIdx > 1) and "" or "")
          elseif absRelIdx == 1 then
            indicator = sfw ~= (relIdx == 1) and "▲" or "▼"
          else
            indicator = ""
          end

          local lnum, col = unpack(posList[idx])
          if nearest then
            local cnt = #posList
            if indicator ~= "" then
              text = ("[%s %d/%d]"):format(indicator, idx, cnt)
            else
              text = ("[%d/%d]"):format(idx, cnt)
            end
            chunks = { { " " }, { text, "HlSearchLensNear" } }
          else
            text = ("[%s %d]"):format(indicator, idx)
            chunks = { { " " }, { text, "HlSearchLens" } }
          end
          render.setVirt(0, lnum - 1, col - 1, chunks, nearest)
        end,
      })
      local keymap_opts = { noremap = true, silent = true }
      vim.api.nvim_set_keymap(
        "n",
        "n",
        "<Cmd>execute('normal! ' . v:count1 . 'n')<CR><Cmd>lua require('hlslens').start()<CR>",
        keymap_opts
      )
      vim.api.nvim_set_keymap(
        "n",
        "N",
        "<Cmd>execute('normal! ' . v:count1 . 'N')<CR><Cmd>lua require('hlslens').start()<CR>",
        keymap_opts
      )
      vim.api.nvim_set_keymap("n", "*", "*<Cmd>lua require('hlslens').start()<CR>", keymap_opts)
      vim.api.nvim_set_keymap("n", "#", "#<Cmd>lua require('hlslens').start()<CR>", keymap_opts)
      vim.api.nvim_set_keymap("n", "g*", "g*<Cmd>lua require('hlslens').start()<CR>", keymap_opts)
      vim.api.nvim_set_keymap("n", "g#", "g#<Cmd>lua require('hlslens').start()<CR>", keymap_opts)
    end,
  },

  {
    "andymass/vim-matchup",
    event = { "BufReadPost", "BufNewFile" },
    -- These globals are read while the plugin loads, so they must be set in
    -- `init` (before load) rather than `config` (after).
    init = function()
      vim.g.matchup_enabled = 1
      vim.g.matchup_surround_enabled = 1
      vim.g.matchup_matchparen_offscreen = { method = "popup" }
    end,
  },

  {
    "niuiic/code-shot.nvim",
    dependencies = { "niuiic/core.nvim", "Aloxaf/silicon" },
    version = "v1",
    -- Screenshotting a selection is the only entry point.
    keys = { { "<leader>ss", mode = "v", desc = "Screenshot selection" } },
    config = function()
      require("code-shot").setup({
        ---@return string output file path
        output = function()
          local core = require("core")
          local buf_name = vim.api.nvim_buf_get_name(0)
          return "~/Pictures/" .. core.file.name(buf_name) .. ".png"
        end,
        ---@return string[]
        -- select_area: {start_line: number, end_line: number} | nil
        options = function(select_area)
          if not select_area then
            return {}
          end
          return {
            "--line-offset",
            select_area.start_line,
            "--theme",
            "DarkNeon",
          }
        end,
      })

      -- set keymap normal mode
      -- vim.api.nvim_set_keymap("n", "<leader>cs", "<cmd>lua require('code-shot').capture()<CR>",
      --   { noremap = true, silent = true })

      -- set keymap visual mode
      vim.api.nvim_set_keymap(
        "v",
        "<leader>ss",
        "<cmd>lua require('code-shot').shot()<CR>",
        { noremap = true, silent = true }
      )
    end,
  },
}
