return {
  {
    "ThePrimeagen/99",
    keys = {
      { "<leader>9v", mode = "v", desc = "99: send visual selection" },
      { "<leader>9x", desc = "99: stop all requests" },
      { "<leader>9s", desc = "99: search" },
    },
    config = function()
      local _99 = require("99")
      local cwd = vim.uv.cwd()
      local basename = vim.fs.basename(cwd)

      _99.setup({
        provider = _99.Providers.ClaudeCodeProvider,
        model = "claude-sonnet-4-6",
        logger = {
          level = _99.DEBUG,
          path = "/tmp/" .. basename .. ".99.debug",
          print_on_error = true,
        },
        tmp_dir = "./claude/tmp",
        md_files = {
          "AGENT.md",
          "CLAUDE.md",
        },
      })

      vim.keymap.set("v", "<leader>9v", function()
        _99.visual()
      end)

      vim.keymap.set("n", "<leader>9x", function()
        _99.stop_all_requests()
      end)

      vim.keymap.set("n", "<leader>9s", function()
        _99.search()
      end)
    end,
  },
  {
    -- Inline AI completion (ghost text) powered by Windsurf, formerly Codeium.
    -- Replaces supermaven-nvim, whose backend stopped serving completions in
    -- 2026. First use needs a free Windsurf account: run `:NeoCodeium auth`.
    "monkoose/neocodeium",
    -- Inline completion only matters while typing; the commands are needed
    -- before that for `:NeoCodeium auth`.
    event = "InsertEnter",
    cmd = "NeoCodeium",
    opts = {
      filetypes = {
        cpp = false,
        help = false,
        gitcommit = false,
        gitrebase = false,
        TelescopePrompt = false,
        ["dap-repl"] = false,
        ["."] = false,
      },
      filter = function(bufnr)
        local path = vim.api.nvim_buf_get_name(bufnr)
        local name = vim.fs.basename(path)
        -- Never send secrets files to the server.
        if name == ".env" or vim.startswith(name, ".env.") then
          return false
        end
        -- No hints while solving LeetCode problems. `:NeoCodeium enable_buffer`
        -- still overrides this for one buffer.
        return not require("rielj.leetcode").contains(path)
      end,
    },
    keys = {
      {
        "<M-p>",
        function()
          require("neocodeium").accept()
        end,
        mode = "i",
        desc = "AI: accept suggestion",
      },
      {
        "<C-j>",
        function()
          require("neocodeium").accept_word()
        end,
        mode = "i",
        desc = "AI: accept word",
      },
      {
        "<C-]>",
        function()
          require("neocodeium").clear()
        end,
        mode = "i",
        desc = "AI: clear suggestion",
      },
      {
        "<M-]>",
        function()
          require("neocodeium").cycle_or_complete()
        end,
        mode = "i",
        desc = "AI: next suggestion",
      },
      {
        "<M-[>",
        function()
          require("neocodeium").cycle_or_complete(-1)
        end,
        mode = "i",
        desc = "AI: previous suggestion",
      },
    },
  },
}
