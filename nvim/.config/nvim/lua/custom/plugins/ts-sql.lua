return {
  {
    dir = "/Users/rielj/personal/neovim-plugins/ts-sql.nvim",
    dependencies = { "nvim-treesitter/nvim-treesitter" },
    ft = { "typescript", "javascript", "typescriptreact", "javascriptreact" },
    config = function()
      require("ts-sql").setup({
        -- Your configuration here
        function_names = { "sql", "tx", "sqlClient" },
        formatter = {
          command = nil, -- auto-detect
          language = "postgresql",
        },
        keymaps = {
          format = "<leader>fq", -- or set to false and configure manually
        },
        format_on_save = false,
      })
    end,
  },
}
