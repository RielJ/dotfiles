local M = {}

M.setup = function()
	local null_ls_status_ok, null_ls = pcall(require, "null-ls")
	if not null_ls_status_ok then
		return
	end

	local formatting = null_ls.builtins.formatting
	local diagnostics = null_ls.builtins.diagnostics
	local hover = null_ls.builtins.hover

	null_ls.setup {
		debug = false,
		on_attach = require("user.lsp.handlers").on_attach,
		capabilities = require("user.lsp.handlers").common_capabilities,
		debounce = 750,
		save_after_format = false,
		diagnostics_format = "[#{c}] #{m} (#{s})",

		sources = {
			formatting.eslint_d.with {
				condition = function(utils)
					return utils.root_has_file { ".eslintrc", ".eslintrc.js" }
				end,
				prefer_local = "node_modules/.bin",
			},
			formatting.prettier.with {
				condition = function(utils)
					return not utils.root_has_file { ".eslintrc", ".eslintrc.js" }
				end,
				prefer_local = "node_modules/.bin",
			},
			formatting.shfmt,
			formatting.clang_format,
			formatting.stylua,
			formatting.black.with { extra_args = { "--fast" } },

			diagnostics.solhint,
			diagnostics.cppcheck,

			hover.dictionary,
		},
	}
end

return M
