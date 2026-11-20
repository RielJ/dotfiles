-- `rust-analyzer` here is rustup's proxy (~/.cargo/bin), so it follows the
-- project's rust-toolchain.toml. A pinned project then gets the matching
-- rust-analyzer, whose proc-macro server matches its rustc.
---@type vim.lsp.Config
return {
  cmd = { "rust-analyzer" },
  settings = {
    ["rust-analyzer"] = {
      -- Diagnostics on save come from clippy instead of `cargo check`.
      -- (`checkOnSave` is a boolean; the command moved to `check.command`.)
      check = { command = "clippy" },
      cargo = {
        -- Build into target/rust-analyzer instead of target/debug. Without this,
        -- rust-analyzer and a terminal `cargo build` / `cargo tauri dev` share
        -- one lock, and each waits for the other to finish. Check artefacts are
        -- metadata only, so the extra disk use is small.
        targetDir = true,
      },
      -- Index the workspace with 4 threads rather than one per core, so opening
      -- a big workspace doesn't take every core while you're trying to type.
      cachePriming = { numThreads = 4 },
    },
  },
}
