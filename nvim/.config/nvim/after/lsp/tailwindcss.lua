-- classFunctions teaches the server to complete inside cn()/cva()/clsx()/tw()
-- calls, not just class= attributes.
---@type vim.lsp.Config
return {
  settings = {
    tailwindCSS = {
      classFunctions = { "tw", "clsx", "cva", "cn" },
    },
  },
}
