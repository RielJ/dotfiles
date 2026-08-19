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
-- Removing unused *locals* has no server-side fix at all: a quickfix request at
-- a 6133 diagnostic returns zero actions and `source.fixAll` leaves the
-- declaration in place. `ge` is therefore an alias for removeUnusedImports,
-- which covers the only unused code the server will remove.

local action = require("rielj.lsp.action")

local CLIENT = "tsc"
local ADD_ALL_IMPORTS = "Add all missing imports"

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
    -- With no batch action the first candidate wins. The server orders them by
    -- its own preference, which is the same order "Add all missing imports"
    -- would have resolved them in.
    select = function(actions)
      for _, candidate in ipairs(actions) do
        if candidate.title == ADD_ALL_IMPORTS then
          return { candidate }
        end
      end
      return actions[1] and { actions[1] } or {}
    end,
  })
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

      vim.notify("Renamed: " .. vim.fn.fnamemodify(old_path, ":t") .. " → " .. vim.fn.fnamemodify(new_path, ":t"))
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
end

M.register_commands()

return M
