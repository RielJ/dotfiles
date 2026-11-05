-- Pyrefly: the only Python type checker. Runs the project's pinned
-- `.venv/bin/pyrefly`, the same binary `make typecheck` runs via `uv run`, so
-- the editor and the check report the same errors. Falls back to $PATH
-- outside a project that pins it.
return {
  cmd = require("rielj.lsp.venv_bin").lsp_cmd("pyrefly", { "lsp" }),
}
