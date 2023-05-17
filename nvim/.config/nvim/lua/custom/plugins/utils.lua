return {
  {
    -- Presence
    {
      "andweeb/presence.nvim",
      enabled = true,
      config = function()
        require("presence"):setup({
          -- General options
          auto_update = true,                       -- Update activity based on autocmd events (if `false`, map or manually execute `:lua package.loaded.presence:update()`)
          neovim_image_text = "Headache Editor",    -- Text displayed when hovered over the Neovim image
          main_image = "neovim",                    -- Main image display (either "neovim" or "file")
          client_id = "793271441293967371",         -- Use your own Discord application client id (not recommended)
          log_level = nil,                          -- Log messages at or above this level (one of the following: "debug", "info", "warn", "error")
          debounce_timeout = 10,                    -- Number of seconds to debounce events (or calls to `:lua package.loaded.presence:update(<filename>, true)`)
          enable_line_number = false,               -- Displays the current line number instead of the current project
          blacklist = {},                           -- A list of strings or Lua patterns that disable Rich Presence if the current file name, path, or workspace matches
          buttons = true,                           -- Configure Rich Presence button(s), either a boolean to enable/disable, a static table (`{{ label = "<label>", url = "<url>" }, ...}`, or a function(buffer: string, repo_url: string|nil): table)
          -- Rich Presence text options
          editing_text = "Editing Shits",           -- Format string rendered when an editable file is loaded in the buffer (either string or function(filename: string): string)
          file_explorer_text = "Browsing Shits",    -- Format string rendered when browsing a file explorer (either string or function(file_explorer_name: string): string)
          git_commit_text = "Committing changes",   -- Format string rendered when committing changes in git (either string or function(filename: string): string)
          plugin_manager_text = "Managing plugins", -- Format string rendered when managing plugins (either string or function(plugin_manager_name: string): string)
          reading_text = "Reading Shits",           -- Format string rendered when a read-only or unmodifiable file is loaded in the buffer (either string or function(filename: string): string)
          workspace_text = "Working on Shits",      -- Format string rendered when in a git repository (either string or function(project_name: string|nil, filename: string): string)
          line_number_text = "Line %s out of %s",   -- Format string rendered when `enable_line_number` is set to true (either string or function(line_number: number, line_count: number): string)
        })
      end,
    },
    {
      "AckslD/nvim-neoclip.lua",
      opts = {},
      dependencies = { "kkharji/sqlite.lua", module = "sqlite" },
    },

    -- hlslens
    {
      "kevinhwang91/nvim-hlslens",
      config = function()
        local _, hlslens = pcall(require, "hlslens")
        hlslens.setup({
          auto_enable = true,
          calm_down = true,
          enable_incsearch = false,
          nearest_only = false,
          override_lens = function(render, plist, nearest, idx, r_idx)
            local sfw = vim.v.searchforward == 1
            local indicator, text, chunks
            local abs_r_idx = math.abs(r_idx)
            if abs_r_idx > 1 then
              indicator = string.format("%d%s", abs_r_idx, sfw ~= (r_idx > 1) and "" or "")
            elseif abs_r_idx == 1 then
              indicator = sfw ~= (r_idx == 1) and "" or ""
            else
              indicator = ""
            end

            local lnum, col = unpack(plist[idx])
            if nearest then
              local cnt = #plist
              if indicator ~= "" then
                text = string.format("[%s %d/%d]", indicator, idx, cnt)
              else
                text = string.format("[%d/%d]", idx, cnt)
              end
              chunks = { { " ", "Ignore" }, { text, "HlSearchLensNear" } }
            else
              text = string.format("[%s %d]", indicator, idx)
              chunks = { { " ", "Ignore" }, { text, "HlSearchLens" } }
            end
            render.set_virt(0, lnum - 1, col - 1, chunks, nearest)
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
      event = "BufReadPost",
    },

    -- Matchup
    {
      "andymass/vim-matchup",
      event = "BufReadPost",
      config = function()
        vim.g.matchup_enabled = 1
        vim.g.matchup_surround_enabled = 1
        vim.g.matchup_matchparen_deferred = 1
        vim.g.matchup_matchparen_offscreen = { method = "popup" }
      end,
    },

    -- Cheatsheet
    {
      "RishabhRD/nvim-cheat.sh",
      dependencies = "RishabhRD/popfix",
      lazy = true,
      config = function()
        vim.g.cheat_default_window_layout = "vertical_split"
      end,
      cmd = { "Cheat", "CheatWithoutComments", "CheatList", "CheatListWithoutComments" },
      keys = "<leader>?",
    },
  },
}
