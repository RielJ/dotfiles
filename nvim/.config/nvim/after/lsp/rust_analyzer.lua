-- Run rust-analyzer through rustup so it tracks the active toolchain rather
-- than whatever standalone binary happens to be first on $PATH.
---@type vim.lsp.Config
return {
  cmd = { "rustup", "run", "stable", "rust-analyzer" },
  settings = {
    ["rust-analyzer"] = {
      checkOnSave = { command = "clippy" },
    },
  },
}
