local M = {}

M.setup = function()
	local null_ls_status_ok, null_ls = pcall(require, "null-ls")
	if not null_ls_status_ok then
		return
	end

	local formatting = null_ls.builtins.formatting
	local diagnostics = null_ls.builtins.diagnostics
	local hover = null_ls.builtins.hover

	null_ls.setup({
		debug = true,
		on_attach = require("user.lsp.handlers").on_attach,
		debounce = 750,
		save_after_format = false,
		sources = {
			-- formatter

			formatting.prettier.with({
				prefer_local = "node_modules/.bin",
				filetypes = {
					"javascript",
					"javascriptreact",
					"typescript",
					"typescriptreact",
					"solidity",
					"vue",
					"css",
					"scss",
					"less",
					"html",
					"markdown",
					"graphql",
					"json",
				},
				condition = function(utils)
					return utils.root_has_file({ ".prettierrc" })
				end,
			}),
			formatting.shfmt,
			formatting.stylua,
			formatting.black.with({ extra_args = { "--fast" } }),

			diagnostics.solhint,

			hover.dictionary,
		},
	})
end

return M
