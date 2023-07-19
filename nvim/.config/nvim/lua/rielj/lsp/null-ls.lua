local M = {}

local custom_attach = require("rielj.lsp.handlers").common_on_attach
local updated_capabilities = require("rielj.lsp.handlers").common_capabilities()

M.setup = function()
  require("null-ls").setup({
    debug = false,
    on_attach = custom_attach,
    capabilities = updated_capabilities,
    debounce = 750,
    save_after_format = false,
    diagnostics_format = "[#{c}] #{m} (#{s})",
    sources = {
      -- require("typescript.extensions.null-ls.code-actions"),
      require("null-ls").builtins.formatting.eslint_d.with({
        condition = function(utils)
          return utils.root_has_file({ ".eslintrc", ".eslintrc.js" })
        end,
        prefer_local = "node_modules/.bin",
      }),
      require("null-ls").builtins.formatting.prettier.with({
        condition = function(utils)
          return not utils.root_has_file({ ".eslintrc", ".eslintrc.js" })
        end,
        prefer_local = "node_modules/.bin",
      }),
      -- require("null-ls").builtins.formatting.shfmt,
      -- require("null-ls").builtins.formatting.clang_format,
      require("null-ls").builtins.formatting.stylua,
      require("null-ls").builtins.formatting.rustfmt,
      -- require("null-ls").builtins.formatting.black.with({ extra_args = { "--fast" } }),
      -- require("null-ls").builtins.diagnostics.solhint,
      -- require("null-ls").builtins.diagnostics.cppcheck,

      require("null-ls").builtins.hover.dictionary,
    },
  })
end
return M
