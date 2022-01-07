local M = {}

M.setup = function()
	local null_ls_status_ok, null_ls = pcall(require, "null-ls")
	if not null_ls_status_ok then
		return
	end

	-- https://github.com/jose-elias-alvarez/null-ls.nvim/tree/main/lua/null-ls/builtins/formatting
	local formatting = null_ls.builtins.formatting
	-- https://github.com/jose-elias-alvarez/null-ls.nvim/tree/main/lua/null-ls/builtins/diagnostics
	local diagnostics = null_ls.builtins.diagnostics
	local code_actions = null_ls.builtins.code_actions
	local hover = null_ls.builtins.hover

	null_ls.setup({
		debug = false,
		on_attach = require("user.lsp.handlers").on_attach,
		debounce = 150,
		save_after_format = false,
		sources = {
			-- formatter
			formatting.prettier.with({
				prefer_local = "node_modules/.bin",
				condition = function(utils)
					return utils.root_has_file({ ".prettierrc" })
				end,
			}),
			formatting.shfmt,
			formatting.stylua,
			formatting.black.with({ extra_args = { "--fast" } }),

			-- diagnostics
			-- diagnostics.eslint.with({
			-- 	prefer_local = "node_modules/.bin",
			-- 	extra_args = { "--no-ignore" },
			-- 	condition = function(utils)
			-- 		return utils.root_has_file({ ".eslintrc.json" })
			-- 	end,
			-- }),

			-- code actions
			code_actions.eslint.with({
				prefer_local = "node_modules/.bin",
				extra_args = { "--no-ignore" },
				condition = function(utils)
					return utils.root_has_file({ ".eslintrc.json" })
				end,
			}),
			code_actions.gitsigns,
			code_actions.gitrebase,
			-- diagnostics.flake8

			-- hover
			hover.dictionary,
		},
	})
end

return M
