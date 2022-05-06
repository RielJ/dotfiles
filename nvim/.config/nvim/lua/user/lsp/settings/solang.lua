local util = require("lspconfig.util")
return {
	-- cmd = { "solang", "--language-server", "--target", "ewasm", "-m", "*/**/node_modules" },
	cmd = { "npx", "solidity-ls", "--stdio" },
	filetypes = { "solidity" },
	root_dir = util.root_pattern("package.json"),
}
