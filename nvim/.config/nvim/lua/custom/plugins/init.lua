-- Small, dependency-free plugins. Each carries the narrowest trigger that still
-- makes it feel always-on.
return {
  {
    "nvim-tree/nvim-web-devicons",
    lazy = true,
    opts = {},
  },

  -- Alignment: :Tabularize is the only entry point.
  { "godlygeek/tabular", cmd = { "Tabularize", "AddTabularPattern", "AddTabularPipeline" } },

  -- TPOPE
  -- Word-shape surgery. All three commands are user-invoked; `S` is Subvert's
  -- substitution shorthand.
  { "tpope/vim-abolish", cmd = { "Abolish", "Subvert", "S" } },
  -- Operators and mappings that only matter once you are editing text.
  { "tpope/vim-surround", event = "VeryLazy" },
  { "tpope/vim-unimpaired", event = "VeryLazy" },
  -- Loaded by vim-surround/unimpaired via `.` repeat; keep it available early.
  { "tpope/vim-repeat", event = "VeryLazy" },
  { "tpope/vim-fugitive", cmd = { "G", "Git", "Gdiffsplit", "Gread", "Gwrite", "Gedit", "Gclog", "Ggrep" } },
  -- Provides :GBrowse to fugitive; only needed once fugitive is up.
  { "tpope/vim-rhubarb", dependencies = { "tpope/vim-fugitive" }, cmd = { "GBrowse" } },
  -- Indentation detection has to happen as the buffer is read.
  { "tpope/vim-sleuth", event = { "BufReadPre", "BufNewFile" } },

  -- Better quickfix window. Nothing to do until one exists.
  { "kevinhwang91/nvim-bqf", ft = "qf" },

  -- log highlighter
  { "mtdl9/vim-log-highlighting", ft = { "text", "log" } },
}
