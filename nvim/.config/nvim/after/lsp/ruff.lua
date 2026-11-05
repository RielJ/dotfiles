-- Ruff: lint diagnostics and code actions only. Pyrefly provides hover, so
-- Ruff's hover is turned off to avoid two popups. The `'*'` config sets no
-- on_attach, so this one survives the merge.
--
-- Runs the project's pinned `.venv/bin/ruff`, the same binary `make lint`
-- runs via `uv run`. Falls back to $PATH outside a project that pins it.
return {
  cmd = require("rielj.lsp.venv_bin").lsp_cmd("ruff", { "server" }),
  on_attach = function(client)
    client.server_capabilities.hoverProvider = false
  end,
}
