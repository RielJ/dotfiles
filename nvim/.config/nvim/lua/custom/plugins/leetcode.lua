local workspace = require("rielj.leetcode")
local leetcode_home = workspace.home

local function is_leetcode_workspace()
  return workspace.contains(vim.fn.getcwd())
end

return {
  {
    "kawre/leetcode.nvim",
    -- Keep LeetCode out of normal editing sessions. Inside the solutions
    -- workspace, both `nvim leetcode.nvim` and `:Leet` are available.
    cond = is_leetcode_workspace,
    lazy = false,
    dependencies = {
      "nvim-lua/plenary.nvim",
      "MunifTanjim/nui.nvim",
      "nvim-telescope/telescope.nvim",
      "nvim-tree/nvim-web-devicons",
      -- Configured in image.lua, which also previews image files.
      "3rd/image.nvim",
    },
    opts = {
      arg = "leetcode.nvim",
      image_support = true,
      lang = "typescript",
      storage = {
        home = leetcode_home,
        -- Keep fetched problems, cookies, and other machine state outside the
        -- public solutions repository.
        cache = vim.fn.stdpath("cache") .. "/leetcode",
      },
      picker = {
        provider = "telescope",
      },
      plugins = {
        non_standalone = true,
      },
      hooks = {
        question_enter = {
          function(question)
            vim.keymap.set("n", "<leader>l", "<cmd>Leet console<cr>", {
              buffer = question.bufnr,
              desc = "LeetCode console",
            })
          end,
        },
      },
      description = {
        position = "left",
        width = "40%",
        show_stats = true,
      },
      console = {
        open_on_runcode = true,
        dir = "row",
        size = {
          width = "90%",
          height = "75%",
        },
      },
    },
  },
}
