return {
  {
    -- TreeSitter
    {
      "nvim-treesitter/nvim-treesitter",
      build = ":TSUpdate",
      config = function()
        require("nvim-treesitter.configs").setup {
          ensure_installed = {}, -- one of "all", "maintained" (parsers with maintainers), or a list of languages
          ignore_install = {},
          matchup = {
            enable = false, -- mandatory, false will disable the whole extension
            -- disable = { "c", "ruby" },  -- optional, list of language that will be disabled
          },
          highlight = {
            enable = true, -- false will disable the whole extension
            additional_vim_regex_highlighting = true,
            disable = { "latex" },
          },
          context_commentstring = {
            enable = true,
            enable_autocmd = false,
            config = {
              typescript = "// %s",
              css = "/* %s */",
              scss = "/* %s */",
              html = "<!-- %s -->",
              svelte = "<!-- %s -->",
              vue = "<!-- %s -->",
              json = "",
              lua = "--",
            },
          },
          indent = { enable = true, disable = { "yaml", "html", "javascript", "python" } },
          autotag = { enable = true, filetypes = { "typescript", "typescriptreact", "vue" } },
          textobjects = {
            swap = {
              enable = false,
            },
            select = {
              enable = false,
            },
          },
          textsubjects = {
            enable = false,
            keymaps = { ["."] = "textsubjects-smart", [";"] = "textsubjects-big" },
          },
          rainbow = {
            enable = false,
            extended_mode = true, -- Highlight also non-parentheses delimiters, boolean or table: lang -> boolean
            max_file_lines = 1000, -- Do not enable for files with more than 1000 lines, int
          },
        }
      end,
    },
    {
      "nvim-treesitter/nvim-treesitter-textobjects",
      dependencies = "nvim-treesitter/nvim-treesitter",
    },
    -- Dim
    {
      "narutoxy/dim.lua",
      dependencies = { "nvim-treesitter/nvim-treesitter", "neovim/nvim-lspconfig" },
      opts = {},
    },
  },
}
