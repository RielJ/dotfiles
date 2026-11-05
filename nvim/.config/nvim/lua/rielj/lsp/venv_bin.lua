-- Resolve a Python tool to the copy pinned in the project's virtualenv.
--
-- `make check` runs `uv run <tool>`, which uses `<project>/.venv/bin/<tool>`.
-- The editor must run that same binary, or it reports a different version's
-- errors. This walks up from `start` to the nearest directory whose
-- `.venv/bin/<name>` exists and returns that path. Outside such a project it
-- returns `name`, so the tool is looked up on $PATH as before.

local M = {}

---@param name string executable name, e.g. "ruff"
---@param start string|integer|nil a path, a buffer number, or nil for the cwd
---@return string
function M.resolve(name, start)
  local relative = vim.fs.joinpath(".venv", "bin", name)
  local root = vim.fs.root(start or vim.fn.getcwd(), function(_, path)
    return vim.fn.executable(vim.fs.joinpath(path, relative)) == 1
  end)
  if root then
    return vim.fs.joinpath(root, relative)
  end
  return name
end

--- An LSP `cmd` function that starts `<name> <args...>` from the project venv.
--- Resolved per client, so each project root gets its own pinned version.
---@param name string
---@param args string[]
---@return fun(dispatchers: vim.lsp.rpc.Dispatchers, config: vim.lsp.ClientConfig): vim.lsp.rpc.PublicClient
function M.lsp_cmd(name, args)
  return function(dispatchers, config)
    local cmd = { M.resolve(name, config.root_dir) }
    vim.list_extend(cmd, args)
    return vim.lsp.rpc.start(cmd, dispatchers, {
      cwd = config.cmd_cwd or config.root_dir,
      env = config.cmd_env,
      detached = config.detached,
    })
  end
end

return M
