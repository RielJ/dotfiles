local M = {}

M.setup = function ()
  local null_ls_status_ok, null_ls = pcall(require, "null-ls")
  if not null_ls_status_ok then
    return
  end

  -- https://github.com/jose-elias-alvarez/null-ls.nvim/tree/main/lua/null-ls/builtins/formatting
  local formatting = null_ls.builtins.formatting
  -- https://github.com/jose-elias-alvarez/null-ls.nvim/tree/main/lua/null-ls/builtins/diagnostics
  local diagnostics = null_ls.builtins.diagnostics
  local code_actions = null_ls.builtins.code_actions

  null_ls.setup({
    debug = false,
    on_attach = require("user.lsp.handlers").on_attach,
    debounce = 150,
    save_after_format = false,
    sources = {
      formatting.eslint_d.with({
       prefer_local = "node_modules/.bin",
       condition = function(utils)
          return utils.root_has_file({ ".eslintrc.js" })
       end
      }),
      formatting.eslint_d.with({
       prefer_local = "node_modules/.bin",
       condition = function(utils)
          return not utils.root_has_file({ ".eslintrc.js" })
       end
      }),
      formatting.shfmt,
      formatting.stylua,
      formatting.prettier.with({ extra_args = { "--no-semi", "--single-quote", "--jsx-single-quote" } }),
      formatting.black.with({ extra_args = { "--fast" } }),

      diagnostics.eslint_d.with { prefer_local = "node_modules/.bin" },

      code_actions.eslint_d.with { prefer_local = "node_modules/.bin" },
      -- diagnostics.flake8
    },
  })
end

return M
