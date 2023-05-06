return {
  {
    -- Completion
    {
      "hrsh7th/nvim-cmp",
      dependencies = {
        "saadparwaiz1/cmp_luasnip",
        "hrsh7th/cmp-buffer",
        "hrsh7th/cmp-nvim-lsp",
        "hrsh7th/cmp-path",
        "hrsh7th/cmp-nvim-lua",
        "hrsh7th/cmp-emoji",
      },
    },
    {
      "tzachar/cmp-tabnine",
      build = "./install.sh",
      dependencies = "hrsh7th/nvim-cmp",
      lazy = true,
      config = function()
        local tabnine = require "cmp_tabnine.config"
        tabnine:setup {
          max_lines = 1000,
          max_num_results = 10,
          sort = true,
        }
      end,
      event = "InsertEnter",
    },
  },
}
