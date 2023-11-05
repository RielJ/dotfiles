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
        -- "hrsh7th/cmp_nvim_lsp",
      },
    },
    {
      "tzachar/cmp-tabnine",
      build = "./install.sh",
      dependencies = "hrsh7th/nvim-cmp",
      event = "InsertEnter",
    },
  },
}
