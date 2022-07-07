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
		debounce = 750,
		save_after_format = false,
		diagnostics_format = "[#{c}] #{m} (#{s})",

		sources = {
			-- formatter

			formatting.prettier.with {
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
				dynamic_command = function(params)
					return command_resolver.from_node_modules(params)
							or command_resolver.from_yarn_pnp(params)
							or vim.fn.executable(params.command) == 1 and params.command
				end,
				-- extra_args = { "--config", vim.fn.expand "~/.config/nvim/lua/user/lsp/settings/.prettierrc" },
				-- condition = function(utils)
				-- 	return utils.root_has_file { ".prettierrc", ".prettierrc*" }
				-- end,
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
