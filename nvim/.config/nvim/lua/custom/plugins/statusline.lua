return {
  {
    -- Statusline
    -- {
    --   "NTBBloodbath/galaxyline.nvim",
    --   dependencies = { "nvim-tree/nvim-web-devicons" },
    -- },
    {
      "nvim-lualine/lualine.nvim",
      event = "VeryLazy",
      init = function()
        vim.g.lualine_laststatus = vim.o.laststatus
        if vim.fn.argc(-1) > 0 then
          -- set an empty statusline till lualine loads
          vim.o.statusline = " "
        else
          -- hide the statusline on the starter page
          vim.o.laststatus = 0
        end
      end,
      config = function()
        -- Patch lualine's git_branch to handle nil package.loaded (happens during Lazy sync)
        local ok, git_branch = pcall(require, "lualine.components.branch.git_branch")
        if ok and git_branch then
          local original_find_git_dir = git_branch.find_git_dir
          git_branch.find_git_dir = function(dir_path)
            if not package.loaded then
              return nil
            end
            return original_find_git_dir(dir_path)
          end
        end
      end,
      dependencies = { "nvim-tree/nvim-web-devicons", opt = true },
    }
  },
}
