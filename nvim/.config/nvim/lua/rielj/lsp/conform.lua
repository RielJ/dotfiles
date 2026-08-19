-- Per-project JS/TS toolchain detection.
-- Formatting priority: oxc (oxfmt) > biome > prettier, chosen by which
-- config file the project actually ships. Linting is handled by the matching
-- LSP server (oxlint / biome), which self-attach per project (see servers/).

-- Config-file markers used to detect each toolchain.
local OXFMT_CONFIGS = { ".oxfmtrc.json", ".oxfmtrc.jsonc", "oxfmt.config.ts" }
local BIOME_CONFIGS = { "biome.json", "biome.jsonc", ".biome.json", ".biome.jsonc" }

-- Search upward from the buffer (or cwd) for any of `markers`.
local function project_has(bufnr, markers)
	local name = vim.api.nvim_buf_get_name(bufnr)
	local start = name ~= "" and name or vim.fn.getcwd()
	return vim.fs.find(markers, { path = start, upward = true, type = "file" })[1] ~= nil
end

-- JS/TS base chain: oxc → biome → prettier.
local function js_chain(bufnr)
	if project_has(bufnr, OXFMT_CONFIGS) then
		return { "oxfmt" }
	end
	if project_has(bufnr, BIOME_CONFIGS) then
		return { "biome", "biome-organize-imports" }
	end
	return { "prettierd", "prettier", stop_after_first = true }
end

local function javascript(bufnr)
	return js_chain(bufnr)
end

-- JSX/TSX: same chain, plus Tailwind class sorting (skip in prettier fallback).
local function javascriptreact(bufnr)
	local chain = js_chain(bufnr)
	if chain.stop_after_first == nil then
		table.insert(chain, "rustywind")
	end
	return chain
end

-- css / json / html: oxfmt doesn't format these yet, so biome → prettier.
local function biome_or_prettier(bufnr)
	if project_has(bufnr, BIOME_CONFIGS) then
		return { "biome", "biome-organize-imports" }
	end
	return { "prettierd", "prettier", stop_after_first = true }
end

require("conform").setup({
	format_on_save = function(bufnr)
		-- Disable autoformat on certain filetypes
		local ignore_filetypes = { "java" }
		if vim.tbl_contains(ignore_filetypes, vim.bo[bufnr].filetype) then
			return
		end
		-- Disable with a global or buffer-local variable
		if vim.g.disable_autoformat or vim.b[bufnr].disable_autoformat then
			return
		end
		-- Disable autoformat for files in a certain path
		local bufname = vim.api.nvim_buf_get_name(bufnr)
		if bufname:match("/node_modules/") then
			return
		end
		-- ...additional logic...
		return { timeout_ms = 4000, lsp_format = "fallback" }
	end,
	formatters = {
		sql_formatter = {
			args = { "-l", "postgresql" },
		},
		biome = {
			require_cwd = true,
		},
		oxfmt = {
			require_cwd = true,
		},
		rustywind = {
			append_args = { "--config", "rustywind.toml" },
		},
	},
	formatters_by_ft = {
		sql = { "sql_formatter" },
		lua = { "stylua" },

		c = { "clang-format" },
		javascript = javascript,
		javascriptreact = javascriptreact,
		typescript = javascript,
		typescriptreact = javascriptreact,
		-- svelte = { "prettierd", "prettier", stop_after_first = true },
		html = biome_or_prettier,
		css = biome_or_prettier,
		json = biome_or_prettier,
		jsonc = biome_or_prettier,

		sol = { "forge_fmt" },
		solidity = { "forge_fmt" },

		go = { "gofumpt", "goimports_reviser", "golines" },

		python = { "ruff_fix", "ruff_format", "ruff_organize_imports" },
	},
})
