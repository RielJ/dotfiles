local rust_analyzer, rust_analyzer_cmd = nil, { "rustup", "run", "stable", "rust-analyzer" }
rust_analyzer = {
  cmd = rust_analyzer_cmd,
  settings = {
    ["rust-analyzer"] = {
      checkOnSave = {
        command = "clippy",
      },
      -- diagnostics = {
      --   enable = true,
      -- },
      -- cargo = {
      --   allFeatures = true,
      -- },
    },
  },
  filetypes = { "rust" },
}
-- end

return rust_analyzer
