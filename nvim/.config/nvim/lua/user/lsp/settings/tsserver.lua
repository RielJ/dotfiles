local ts_utils_settings = {
	-- debug = true,
	import_all_scan_buffers = 100,
	update_imports_on_move = true,
	-- filter out dumb module warning
	filter_out_diagnostics_by_code = { 80001 },
	debug = false,
	disable_commands = false,
	enable_import_on_completion = false,
	import_all_timeout = 5000, -- ms

	-- eslint
	eslint_enable_code_actions = true,
	eslint_enable_disable_comments = true,
	eslint_bin = "eslint_d",
	eslint_config_fallback = nil,
	eslint_enable_diagnostics = true,

	-- formatting
	enable_formatting = false,
	formatter = "prettierd",
	formatter_config_fallback = nil,

	-- parentheses completion
	complete_parens = false,
	signature_help_in_parens = false,

	-- update imports on file move
	require_confirmation_on_move = false,
	watch_dir = nil,
}
local keymap = vim.api.nvim_set_keymap

local lspconfig = require("lspconfig")
local ts_utils = require("nvim-lsp-ts-utils")
local on_attach = require("user.lsp.handlers").on_attach
local capabilities = require("user.lsp.handlers").capabilities

return {
	root_dir = lspconfig.util.root_pattern("package.json"),
	init_options = ts_utils.init_options,
	on_attach = function(client, bufnr)
		on_attach(client, bufnr)

		ts_utils.setup(ts_utils_settings)
		ts_utils.setup_client(client)

		keymap("n", "gs", ":TSLspOrganize<CR>")
		keymap("n", "gI", ":TSLspRenameFile<CR>")
		keymap("n", "go", ":TSLspImportAll<CR>")
	end,
	flags = {
		debounce_text_changes = 150,
	},
	capabilities = capabilities,
}
