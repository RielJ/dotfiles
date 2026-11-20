-- classFunctions teaches the server to complete inside cn()/cva()/clsx()/tw()
-- calls, not just class= attributes.
--
-- cmd preloads a guard into the server and its forked oxide-helper. The helper
-- prints to the LSP's stdout, which breaks Neovim's message parser on Tailwind
-- v4 projects. See lua/rielj/lsp/tailwind-stdout-guard.cjs.
--
-- lspconfig's cmd is a function that calls vim.lsp.rpc.start without spawn
-- options, so `cmd_env` would be ignored. This copies its binary lookup
-- (project-local node_modules/.bin first) and passes the env explicitly.
local guard = vim.fs.joinpath(vim.fn.stdpath("config"), "lua/rielj/lsp/tailwind-stdout-guard.cjs")
local node_options = vim.trim(('%s --require "%s"'):format(vim.env.NODE_OPTIONS or "", guard))

---@type vim.lsp.Config
return {
  cmd = function(dispatchers, config)
    local cmd = "tailwindcss-language-server"
    if config and config.root_dir then
      local local_cmd = vim.fs.joinpath(config.root_dir, "node_modules/.bin", cmd)
      if vim.fn.executable(local_cmd) == 1 then
        cmd = local_cmd
      end
    end
    return vim.lsp.rpc.start({ cmd, "--stdio" }, dispatchers, {
      env = { NODE_OPTIONS = node_options },
    })
  end,
  settings = {
    tailwindCSS = {
      classFunctions = { "tw", "clsx", "cva", "cn" },
    },
  },
}
