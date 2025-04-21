local _, lspconfig = pcall(require, "lspconfig")

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
  root_dir = lspconfig.util.root_pattern("Cargo.toml"),
  filetypes = { "rust" },
}
-- end

return rust_analyzer
