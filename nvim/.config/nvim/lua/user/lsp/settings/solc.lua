local util = require("lspconfig.util")
return {
	cmd = { "solc", "--lsp", "--include-path", "node_modules" },
	filetypes = { "solidity" },
	root_dir = util.root_pattern("package.json", "node_modules", ".git"),
}
