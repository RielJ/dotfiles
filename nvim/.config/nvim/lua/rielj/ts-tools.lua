-- rielj.ts-tools
--
-- typescript-tools.nvim-style commands on top of the TypeScript 7 native server
-- (`tsc --lsp --stdio`, formerly `tsgo`).
--
-- What the server actually implements, probed live against tsc 7.0.2:
--
--   codeActionProvider.codeActionKinds = {
--     "quickfix", "source.organizeImports", "source.removeUnusedImports",
--     "source.sortImports", "source.fixAll",
--   }
--
-- There is no `source.addMissingImports` and no `source.removeUnused` — those
-- are tsserver-era kinds that only ts_ls/vtsls expose. Requesting them returns
-- nothing, which is why the old `go`/`ge` mappings were silently dead.
--
-- Add-missing-imports is still reachable: a whole-buffer `quickfix` request
-- with the buffer's diagnostics in context makes the server offer
-- "Add all missing imports" (plus one "Add import from X" per unresolved name),
-- each carrying a complete workspace edit. `M.add_missing_imports` picks the
-- batch action when present and falls back to the first single import fix.
--
-- One upstream gap `go` has to paper over: when the symbol is re-exported by a
-- package barrel (`export { truncateToWidth } from "./utils.ts"` in
-- `dist/index.d.ts`), tsc offers only "Add import from <package>" even though
-- the file already imports from that exact specifier. In
-- internal/ls/autoimport/fix.go, `tryAddToExistingImport` looks up existing
-- imports by `export.ModuleID` — the *declaring* module (`dist/utils.d.ts`) —
-- while the specifier it prints is the package root, so the lookup misses and
-- the fix comes back as AddNew. Result: a second `import { x } from "pkg"`
-- line. Probed against tsc 7.0.2; a relative barrel inside the project offers
-- both "Update" and "Add", so this only bites through node_modules.
--
-- `source.organizeImports` merges those duplicates (`source.sortImports` does
-- not), so `add_missing_imports` follows up with it, but only when the fix
-- itself split a module across two statements. Pre-existing duplicate or
-- type/value-split imports are left alone.
--
-- Removing unused *locals* has no server-side fix at all: a quickfix request at
-- a 6133 diagnostic returns zero actions and `source.fixAll` leaves the
-- declaration in place. `ge` is therefore an alias for removeUnusedImports,
-- which covers the only unused code the server will remove.

local action = require("rielj.lsp.action")

local CLIENT = "tsc"
local ADD_ALL_IMPORTS = "Add all missing imports"

-- Long enough to clear Neovim's didChange debounce (150 ms by default), so the
-- follow-up request is answered against the edited document.
local MERGE_DELAY_MS = 250

-- Every title the server can put on an import fix, from typescript-go's
-- internal/diagnostics:
--
--   90013  Import '{0}' from "{1}"
--   90057  Add import from "{0}"
--   90058  Update import from "{0}"   <- when an import from that module exists
--   95064  Add all missing imports
--
-- 90058 is the one that matters in practice: as soon as the file already
-- imports *something* from the target module, the server offers to widen that
-- statement rather than add a second one. Matching only "Add import from" made
-- `go` report "no matching code actions" in exactly the case where the fix was
-- most obviously available.
local IMPORT_FIX_PATTERNS = {
	"^Add import from ",
	"^Update import from ",
	"^Import '",
}

--- Does this action's title name an import fix?
---@param title string
---@return boolean
local function is_import_fix(title)
	if title == ADD_ALL_IMPORTS then
		return true
	end
	for _, pattern in ipairs(IMPORT_FIX_PATTERNS) do
		if title:match(pattern) then
			return true
		end
	end
	return false
end

--- Preference order when the server offers several fixes for one name.
---
--- A barrel re-export produces two candidates for the same symbol: "Update
--- import from <barrel>" (widen the statement already in the file) and "Add
--- import from <inner module>" (a second statement). Widening is what a human
--- picking from the menu would choose, and server order does not guarantee it
--- comes first.
---@param title string
---@return integer
local function import_fix_rank(title)
	if title == ADD_ALL_IMPORTS then
		return 0
	elseif title:match("^Update import from ") then
		return 1
	elseif title:match("^Import '") then
		return 2
	end
	return 3
end

--- Module specifier of every top-level import statement, as spec -> count.
---
--- Tree-sitter rather than a line pattern, so multi-line and type-only imports
--- are counted once each and `from "x"` inside a string is not counted at all.
---@param bufnr integer
---@return table<string, integer>
local function import_specifier_counts(bufnr)
	local counts = {}
	local ok, parser = pcall(vim.treesitter.get_parser, bufnr)
	if not ok or not parser then
		return counts
	end

	local lang = parser:lang()
	local query_ok, query =
		pcall(vim.treesitter.query.parse, lang, [[(import_statement source: (string (string_fragment) @spec))]])
	if not query_ok then
		return counts
	end

	local tree = parser:parse()[1]
	if not tree then
		return counts
	end

	for _, node in query:iter_captures(tree:root(), bufnr, 0, -1) do
		local spec = vim.treesitter.get_node_text(node, bufnr)
		counts[spec] = (counts[spec] or 0) + 1
	end
	return counts
end

--- Did the fix split a module across two import statements?
---@param before table<string, integer>
---@param after table<string, integer>
---@return string|nil spec The module now imported twice
local function duplicated_specifier(before, after)
	for spec, count in pairs(after) do
		if count > 1 and count > (before[spec] or 0) then
			return spec
		end
	end
	return nil
end

local M = {}

--- The TypeScript client attached to this buffer, if any.
---@param bufnr integer
---@return vim.lsp.Client|nil
local function ts_client(bufnr)
	return vim.lsp.get_clients({ bufnr = bufnr, name = CLIENT })[1]
end

--- Apply every action of `kind`, or warn if the server is not attached.
---@param kind string
---@param bufnr? integer
local function apply_kind(kind, bufnr)
	bufnr = bufnr or vim.api.nvim_get_current_buf()
	if not ts_client(bufnr) then
		vim.notify("TypeScript LSP (" .. CLIENT .. ") not attached", vim.log.levels.WARN)
		return
	end
	action.apply({ bufnr = bufnr, client = CLIENT, kind = kind, notify = true })
end

--- Remove unused imports.
function M.remove_unused_imports()
	apply_kind("source.removeUnusedImports")
end

--- Alias of `remove_unused_imports`. The server cannot remove unused locals.
M.remove_unused = M.remove_unused_imports

--- Organize imports (sort + remove unused).
function M.organize_imports()
	apply_kind("source.organizeImports")
end

--- Sort imports without removing anything.
function M.sort_imports()
	apply_kind("source.sortImports")
end

--- Fix everything the server considers auto-fixable.
function M.fix_all()
	apply_kind("source.fixAll")
end

--- Add imports for every unresolved name in the buffer.
---
--- Implemented over `quickfix` because the server exposes no
--- `source.addMissingImports` kind.
function M.add_missing_imports()
	local bufnr = vim.api.nvim_get_current_buf()
	if not ts_client(bufnr) then
		vim.notify("TypeScript LSP (" .. CLIENT .. ") not attached", vim.log.levels.WARN)
		return
	end

	local before = import_specifier_counts(bufnr)

	action.apply({
		bufnr = bufnr,
		client = CLIENT,
		kind = "quickfix",
		notify = true,
		-- Cheap pre-filter so unrelated quickfixes are never resolved.
		filter = function(candidate)
			return is_import_fix(candidate.title or "")
		end,
		-- One batch edit beats N single-import edits computed against the same
		-- original document, which would conflict once the first is applied.
		--
		-- With no batch action the best-ranked single fix wins: widening an
		-- existing statement before adding a new one.
		select = function(actions)
			local best
			for _, candidate in ipairs(actions) do
				local rank = import_fix_rank(candidate.title or "")
				if not best or rank < best.rank then
					best = { rank = rank, action = candidate }
				end
				if rank == 0 then
					break
				end
			end
			return best and { best.action } or {}
		end,
		on_applied = function(applied)
			if #applied == 0 then
				return
			end
			-- The buffer changed; the server only sees it after didChange, which is
			-- debounced. Ask again once it has caught up.
			vim.defer_fn(function()
				if not vim.api.nvim_buf_is_valid(bufnr) then
					return
				end
				local spec = duplicated_specifier(before, import_specifier_counts(bufnr))
				if not spec then
					return
				end
				action.apply({
					bufnr = bufnr,
					client = CLIENT,
					kind = "source.organizeImports",
					on_applied = function(organized)
						if #organized > 0 then
							vim.notify('Merged duplicate imports from "' .. spec .. '"', vim.log.levels.INFO)
						end
					end,
				})
			end, MERGE_DELAY_MS)
		end,
	})
end

--- Push the current position onto the tag stack, so <C-t> comes back.
---
--- `vim.lsp.buf.definition` does this internally; a hand-rolled jump has to do
--- it itself or the jump is one-way.
local function push_tagstack()
	local winid = vim.api.nvim_get_current_win()
	local from = { vim.fn.bufnr("%"), vim.fn.line("."), vim.fn.col("."), 0 }
	vim.fn.settagstack(winid, { items = { { from = from, tagname = vim.fn.expand("<cword>") } } }, "t")
end

--- Go to the *implementation* of the symbol under the cursor, not its type
--- declaration.
---
--- Plain `gd` on an import from a compiled package lands in the shipped `.d.ts`,
--- which tells you the signature and nothing else. The server exposes a second,
--- non-standard provider that resolves through the declaration file to the
--- original source when the package ships it (via `sourceMap`/`declarationMap`):
---
---   experimental.customSourceDefinitionProvider = true
---   custom/textDocument/sourceDefinition  ->  LocationLink[]
---
--- Registered in typescript-go's internal/lsp/server.go as
--- `handleSourceDefinition`. This is VS Code's "Go to Source Definition".
---
--- Falls back to the ordinary definition request when there is no source to
--- find, which is the common case for a package that ships no maps.
function M.source_definition()
	local bufnr = vim.api.nvim_get_current_buf()
	local client = ts_client(bufnr)
	if not client then
		vim.notify("TypeScript LSP (" .. CLIENT .. ") not attached", vim.log.levels.WARN)
		return
	end

	local params = vim.lsp.util.make_position_params(0, client.offset_encoding)

	client:request("custom/textDocument/sourceDefinition", params, function(err, result)
		if err then
			vim.notify("Source definition: " .. err.message, vim.log.levels.ERROR)
			return
		end

		if not result or vim.tbl_isempty(result) then
			vim.notify("No source definition, falling back to definition", vim.log.levels.INFO)
			vim.lsp.buf.definition()
			return
		end

		push_tagstack()

		if #result == 1 then
			vim.lsp.util.show_document(result[1], client.offset_encoding, { reuse_win = true, focus = true })
			return
		end

		-- More than one source: let the quickfix list arbitrate.
		vim.fn.setqflist({}, " ", {
			title = "Source definitions",
			items = vim.lsp.util.locations_to_items(result, client.offset_encoding),
		})
		vim.cmd("botright copen")
	end, bufnr)
end

--- Rename the current file and update every import that points at it.
function M.rename_file()
	local bufnr = vim.api.nvim_get_current_buf()
	local old_path = vim.api.nvim_buf_get_name(bufnr)

	if old_path == "" then
		vim.notify("Buffer has no file path", vim.log.levels.WARN)
		return
	end

	vim.ui.input({ prompt = "New file path: ", default = old_path }, function(new_path)
		if not new_path or new_path == "" or new_path == old_path then
			return
		end

		local client = ts_client(bufnr)
		if not client then
			vim.notify("TypeScript LSP (" .. CLIENT .. ") not attached", vim.log.levels.WARN)
			return
		end

		local rename_params = {
			files = {
				{
					oldUri = vim.uri_from_fname(old_path),
					newUri = vim.uri_from_fname(new_path),
				},
			},
		}

		client:request("workspace/willRenameFiles", rename_params, function(_, result)
			-- Import-path updates, computed before the file moves.
			if result then
				vim.lsp.util.apply_workspace_edit(result, client.offset_encoding or "utf-16")
			end

			local ok, rename_err = pcall(vim.fn.rename, old_path, new_path)
			if not ok then
				vim.notify("Failed to rename file: " .. tostring(rename_err), vim.log.levels.ERROR)
				return
			end

			vim.api.nvim_buf_set_name(bufnr, new_path)
			vim.cmd("write!")

			if client:supports_method("workspace/didRenameFiles") then
				client:notify("workspace/didRenameFiles", rename_params)
			end

			vim.notify(
				"Renamed: " .. vim.fn.fnamemodify(old_path, ":t") .. " → " .. vim.fn.fnamemodify(new_path, ":t")
			)
		end, bufnr)
	end)
end

--- Register user commands.
function M.register_commands()
	local commands = {
		TsOrganizeImports = { M.organize_imports, "Organize imports" },
		TsSortImports = { M.sort_imports, "Sort imports (non-destructive)" },
		TsRemoveUnusedImports = { M.remove_unused_imports, "Remove unused imports" },
		TsAddMissingImports = { M.add_missing_imports, "Add missing imports" },
		TsFixAll = { M.fix_all, "Fix all auto-fixable issues" },
		TsRenameFile = { M.rename_file, "Rename file and update imports" },
	}
	for name, spec in pairs(commands) do
		vim.api.nvim_create_user_command(name, spec[1], { desc = spec[2] })
	end
end

--- Buffer-local keymaps, mirroring typescript-tools.nvim.
---@param bufnr integer
function M.on_attach(bufnr)
	local bufmap = require("rielj.keymap").bufmap

	bufmap(bufnr, "n", "gs", M.remove_unused_imports, { desc = "Remove unused imports" })
	bufmap(bufnr, "n", "ge", M.remove_unused, { desc = "Remove unused imports (alias of gs)" })
	bufmap(bufnr, "n", "gS", M.organize_imports, { desc = "Organize imports" })
	bufmap(bufnr, "n", "go", M.add_missing_imports, { desc = "Add missing imports" })
	bufmap(bufnr, "n", "gA", M.fix_all, { desc = "Fix all" })
	bufmap(bufnr, "n", "gR", M.rename_file, { desc = "Rename file" })

	-- Shadows the generic `gD` (declaration), which is dead weight here: the
	-- server advertises no declarationProvider at all, so that map did nothing in
	-- a TypeScript buffer. Buffer-local wins because LspAttach fires *before*
	-- a config's on_attach.
	bufmap(bufnr, "n", "gD", M.source_definition, { desc = "Go to source definition" })
end

M.register_commands()

return M
