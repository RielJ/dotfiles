local util = require("lspconfig.util")
return {
	root_dir = util.root_pattern(
		"tailwind.config.js",
		"tailwind.config.ts",
		"postcss.config.js",
		"postcss.config.ts",
		"package.json",
		"node_modules",
		".git"
	),
	filetypes = {
		"typescriptreact",
		"javascriptreact",
	},
}
