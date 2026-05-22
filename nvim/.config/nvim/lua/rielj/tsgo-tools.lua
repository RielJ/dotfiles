-- tsgo-tools.lua
-- Thin wrapper around tsgo LSP to provide typescript-tools.nvim-like commands
-- Requires tsgo to be installed: go install github.com/nicholashusnern/typescript-go/cmd/tsgo@latest
-- Or via npm: npm install -g @anthropic/tsgo (check latest install method)

local M = {}

--- Get the tsgo client attached to the current buffer
---@return vim.lsp.Client|nil
local function get_tsgo_client(bufnr)
  bufnr = bufnr or vim.api.nvim_get_current_buf()
  local clients = vim.lsp.get_clients({ bufnr = bufnr, name = "tsgo" })
  if #clients == 0 then
    return nil
  end
  return clients[1]
end

--- Apply code actions of a specific kind automatically (no prompt)
---@param kind string LSP code action kind
---@param bufnr? number
local function apply_code_action(kind, bufnr)
  bufnr = bufnr or vim.api.nvim_get_current_buf()
  local client = get_tsgo_client(bufnr)
  if not client then
    vim.notify("tsgo LSP not attached", vim.log.levels.WARN)
    return
  end

  -- Get the full buffer range
  local line_count = vim.api.nvim_buf_line_count(bufnr)
  local last_line = vim.api.nvim_buf_get_lines(bufnr, line_count - 1, line_count, false)
  local last_col = last_line[1] and #last_line[1] or 0

  local params = {
    textDocument = vim.lsp.util.make_text_document_params(bufnr),
    range = {
      start = { line = 0, character = 0 },
      ["end"] = { line = line_count - 1, character = last_col },
    },
    context = {
      diagnostics = vim.diagnostic.get(bufnr),
      only = { kind },
      triggerKind = vim.lsp.protocol.CodeActionTriggerKind.Invoked,
    },
  }

  client:request("textDocument/codeAction", params, function(err, result)
    if err then
      vim.notify("Code action error: " .. (err.message or vim.inspect(err)), vim.log.levels.ERROR)
      return
    end

    if not result or #result == 0 then
      vim.notify("No code actions available for: " .. kind, vim.log.levels.INFO)
      return
    end

    -- Apply all matching actions
    for _, action in ipairs(result) do
      if action.edit then
        vim.lsp.util.apply_workspace_edit(action.edit, client.offset_encoding or "utf-16")
      end
      if action.command then
        vim.lsp.buf.execute_command(action.command)
      end
    end
  end, bufnr)
end

--- Remove unused imports
function M.remove_unused_imports()
  apply_code_action("source.removeUnusedImports", vim.api.nvim_get_current_buf())
end

--- Remove all unused code
function M.remove_unused()
  -- Try source.removeUnused first, fall back to fixAll for unused
  apply_code_action("source.removeUnused", vim.api.nvim_get_current_buf())
end

--- Organize imports (sort + remove unused)
function M.organize_imports()
  apply_code_action("source.organizeImports", vim.api.nvim_get_current_buf())
end

--- Add missing imports
function M.add_missing_imports()
  apply_code_action("source.addMissingImports", vim.api.nvim_get_current_buf())
end

--- Fix all auto-fixable issues
function M.fix_all()
  apply_code_action("source.fixAll", vim.api.nvim_get_current_buf())
end

--- Rename file and update all imports
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

    local client = get_tsgo_client(bufnr)
    if not client then
      vim.notify("tsgo LSP not attached", vim.log.levels.WARN)
      return
    end

    -- Try willRenameFiles if the server supports it
    local will_rename_params = {
      files = {
        {
          oldUri = vim.uri_from_fname(old_path),
          newUri = vim.uri_from_fname(new_path),
        },
      },
    }

    client:request("workspace/willRenameFiles", will_rename_params, function(err, result)
      -- Apply workspace edits (import path updates) if provided
      if result then
        vim.lsp.util.apply_workspace_edit(result, client.offset_encoding or "utf-16")
      end

      -- Perform the actual file rename
      local ok, rename_err = pcall(vim.fn.rename, old_path, new_path)
      if not ok then
        vim.notify("Failed to rename file: " .. tostring(rename_err), vim.log.levels.ERROR)
        return
      end

      -- Update the buffer to point to the new file
      vim.api.nvim_buf_set_name(bufnr, new_path)
      vim.cmd("write!")

      -- Notify the LSP about the rename
      if client.supports_method("workspace/didRenameFiles") then
        client:notify("workspace/didRenameFiles", will_rename_params)
      end

      vim.notify("Renamed: " .. vim.fn.fnamemodify(old_path, ":t") .. " → " .. vim.fn.fnamemodify(new_path, ":t"))
    end, bufnr)
  end)
end

--- Sort imports (non-destructive, does not remove unused)
function M.sort_imports()
  apply_code_action("source.sortImports", vim.api.nvim_get_current_buf())
end

--- Register user commands
function M.register_commands()
  vim.api.nvim_create_user_command("TsgoOrganizeImports", M.organize_imports, { desc = "Organize imports" })
  vim.api.nvim_create_user_command("TsgoRemoveUnusedImports", M.remove_unused_imports, { desc = "Remove unused imports" })
  vim.api.nvim_create_user_command("TsgoRemoveUnused", M.remove_unused, { desc = "Remove unused code" })
  vim.api.nvim_create_user_command("TsgoAddMissingImports", M.add_missing_imports, { desc = "Add missing imports" })
  vim.api.nvim_create_user_command("TsgoFixAll", M.fix_all, { desc = "Fix all auto-fixable issues" })
  vim.api.nvim_create_user_command("TsgoRenameFile", M.rename_file, { desc = "Rename file and update imports" })
  vim.api.nvim_create_user_command("TsgoSortImports", M.sort_imports, { desc = "Sort imports (non-destructive)" })
end

--- Setup keymaps (mirrors typescript-tools.nvim bindings)
---@param bufnr number
function M.on_attach(bufnr)
  local buf_opts = { noremap = true, silent = true, buffer = bufnr }
  vim.keymap.set("n", "gs", M.remove_unused_imports, vim.tbl_extend("force", buf_opts, { desc = "Remove unused imports" }))
  vim.keymap.set("n", "ge", M.remove_unused, vim.tbl_extend("force", buf_opts, { desc = "Remove unused" }))
  vim.keymap.set("n", "gS", M.organize_imports, vim.tbl_extend("force", buf_opts, { desc = "Organize imports" }))
  vim.keymap.set("n", "go", M.add_missing_imports, vim.tbl_extend("force", buf_opts, { desc = "Add missing imports" }))
  vim.keymap.set("n", "gA", M.fix_all, vim.tbl_extend("force", buf_opts, { desc = "Fix all" }))
  vim.keymap.set("n", "gR", M.rename_file, vim.tbl_extend("force", buf_opts, { desc = "Rename file" }))
end

-- Register commands on load
M.register_commands()

return M
