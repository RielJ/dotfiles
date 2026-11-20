local M = {}

--- Diagnostic presentation, plus the single LspAttach hook that wires up every
--- buffer a language server attaches to.
---
--- The sign_define() loop that stood here was the pre-0.10 way of setting sign
--- text; the `signs.text` table below already does it, with the same glyphs.
M.setup = function()
  local config = {
    -- Signs and the float carry the message; virtual text just adds noise.
    virtual_text = false,
    signs = {
      text = {
        [vim.diagnostic.severity.ERROR] = "",
        [vim.diagnostic.severity.WARN] = "",
        [vim.diagnostic.severity.INFO] = "",
        [vim.diagnostic.severity.HINT] = "",
      },
    },
    update_in_insert = true,
    underline = true,
    severity_sort = true,
    float = {
      focusable = false,
      style = "minimal",
      source = true,
      header = "",
      prefix = "",
    },
  }

  vim.diagnostic.config(config)

  -- Float borders come from `vim.o.winborder` (set in plugin/options.lua), so
  -- the old vim.lsp.with() hover/signatureHelp wrappers are not needed.

  vim.api.nvim_create_autocmd("LspAttach", {
    group = vim.api.nvim_create_augroup("rielj-lsp-attach", { clear = true }),
    callback = function(args)
      local client = vim.lsp.get_client_by_id(args.data.client_id)
      if client then
        M.common_on_attach(client, args.buf)
      end
    end,
  })

  -- A server may register capabilities *after* it has attached, via dynamic
  -- registration. Since every map below is gated on the client supporting the
  -- method, a capability that shows up late would otherwise never get its
  -- keymap: LspAttach already fired, and nothing re-runs the gate.
  --
  -- Re-run the attach logic for the client's buffers when that happens. Both
  -- helpers clear their own autocommands first, so this is idempotent.
  local register_capability = vim.lsp.handlers["client/registerCapability"]
  vim.lsp.handlers["client/registerCapability"] = function(err, res, ctx)
    local client = vim.lsp.get_client_by_id(ctx.client_id)
    if client and res then
      M.drop_ancestor_watchers(client, res)
    end

    local result = register_capability(err, res, ctx)

    if client then
      for bufnr in pairs(client.attached_buffers) do
        if vim.api.nvim_buf_is_valid(bufnr) then
          M.common_on_attach(client, bufnr)
        end
      end
    end

    return result
  end
end

local case_insensitive = vim.fn.has("mac") == 1 or vim.fn.has("win32") == 1

local function norm(path)
  path = vim.fs.normalize(path)
  return case_insensitive and path:lower() or path
end

--- Base directory of a RelativePattern watcher, or nil for a plain glob string
--- (Neovim roots those at the workspace folders, so they are always safe).
local function watcher_base(watcher)
  local glob = watcher.globPattern
  if type(glob) ~= "table" then
    return nil
  end
  local uri = type(glob.baseUri) == "table" and glob.baseUri.uri or glob.baseUri
  return type(uri) == "string" and vim.uri_to_fname(uri) or nil
end

--- Drop `workspace/didChangeWatchedFiles` watchers rooted at a parent of the
--- workspace, mutating `res` in place.
---
--- tsgo (7.0.2) registers `**/*` under `file:///users`, i.e. a recursive
--- FSEvents watch on the whole home folder. Every write anywhere under ~ then
--- reaches Neovim's watcher, which asserts on paths it cannot stat
--- (`_watch.lua:90: ENOTDIR … Library/Caches/…`) and, under churn, rebuilds
--- its FSEvents stream until macOS refuses (`_watch.lua:73: EMFILE`).
--- Those parent-folder watches only cover failed module lookups such as
--- ~/node_modules, so losing them costs nothing in practice.
---@param client vim.lsp.Client
---@param res lsp.RegistrationParams
function M.drop_ancestor_watchers(client, res)
  local folders = vim.tbl_map(function(f)
    return norm(vim.uri_to_fname(f.uri))
  end, client.workspace_folders or {})
  if #folders == 0 then
    return
  end

  for _, reg in ipairs(res.registrations or {}) do
    local watchers = reg.method == "workspace/didChangeWatchedFiles"
      and reg.registerOptions
      and reg.registerOptions.watchers
    if watchers then
      reg.registerOptions.watchers = vim.tbl_filter(function(w)
        local base = watcher_base(w)
        if not base then
          return true
        end
        base = norm(base)
        for _, folder in ipairs(folders) do
          if base ~= folder and vim.fs.relpath(base, folder) then
            return false
          end
        end
        return true
      end, watchers)
    end
  end
end

local function lsp_highlight_document(client, bufnr)
  local augroup_highlight = vim.api.nvim_create_augroup("custom-lsp-references", { clear = false })
  -- The capability is `documentHighlightProvider`. This used to test
  -- `document_highlight`, which no server ever sets, so the autocommands below
  -- were never created and symbol highlighting never worked.
  if client:supports_method("textDocument/documentHighlight", bufnr) then
    vim.api.nvim_clear_autocmds({ group = augroup_highlight, buffer = bufnr })
    vim.api.nvim_create_autocmd("CursorHold", {
      group = augroup_highlight,
      buffer = bufnr,
      callback = function()
        vim.lsp.buf.document_highlight()
      end,
    })
    vim.api.nvim_create_autocmd("CursorMoved", {
      group = augroup_highlight,
      buffer = bufnr,
      callback = function()
        vim.lsp.buf.clear_references()
      end,
    })
  end
end

--- Code lenses are pull-based: the server never volunteers them, so unless
--- they are enabled nothing is attached to the buffer and `vim.lsp.codelens.run`
--- (<leader>lA) has nothing to run. gopls' `codelenses.test` was configured but
--- invisible for exactly this reason.
---
--- Since Nvim 0.13 `enable` replaces the deprecated `refresh`: the built-in
--- provider requests lenses on attach and re-requests on buffer changes.
--- `rielj.lsp.codelens` moves them from a line above onto the code line.
local function lsp_codelens(client, bufnr)
  if not client:supports_method("textDocument/codeLens", bufnr) then
    return
  end
  require("rielj.lsp.codelens").setup()
  vim.lsp.codelens.enable(true, { bufnr = bufnr })
end

--- Buffer-local LSP keymaps.
---
--- Every navigation map is gated on the attaching client actually implementing
--- the method. This is not cosmetic: LspAttach fires once *per client*, and a
--- buffer here routinely has three (tsc, oxlint, tailwindcss). An ungated map
--- is re-applied by whichever client attaches last, silently overwriting a
--- server-specific map set earlier -- which is exactly how ts-tools' `gD`
--- (source definition) was being clobbered by oxlint's attach.
local function lsp_keymaps(client, bufnr)
  local bufmap = require("rielj.keymap").bufmap

  ---@param method string
  ---@return boolean
  local function has(method)
    return client:supports_method(method, bufnr)
  end

  -- Almost no server implements textDocument/declaration (it is a C/C++ notion:
  -- clangd does, gopls/tsc/lua_ls/rust_analyzer do not), so this map used to be
  -- dead in most buffers while still occupying `gD`.
  if has("textDocument/declaration") then
    bufmap(bufnr, "n", "gD", vim.lsp.buf.declaration, { desc = "Go to declaration" })
  end
  if has("textDocument/definition") then
    bufmap(bufnr, "n", "gd", vim.lsp.buf.definition, { desc = "Go to definition" })
  end
  if has("textDocument/implementation") then
    bufmap(bufnr, "n", "gi", vim.lsp.buf.implementation, { desc = "Go to implementation" })
  end
  if has("textDocument/references") then
    bufmap(bufnr, "n", "gr", vim.lsp.buf.references, { desc = "References" })
  end
  -- Cap the floats: an unbounded hover on a wide inferred type takes the whole
  -- screen and hides the code it is describing.
  local function float_size()
    return {
      max_height = math.floor(vim.o.lines * 0.5),
      max_width = math.floor(vim.o.columns * 0.4),
    }
  end

  if has("textDocument/hover") then
    bufmap(bufnr, "n", "K", function()
      vim.lsp.buf.hover(float_size())
    end, { desc = "Hover" })
  end
  if has("textDocument/signatureHelp") then
    bufmap(bufnr, "n", "<C-k>", function()
      vim.lsp.buf.signature_help(float_size())
    end, { desc = "Signature help" })
  end
  if has("textDocument/rename") then
    -- No `filter`: `vim.lsp.buf.rename` already restricts itself to clients
    -- advertising textDocument/rename.
    bufmap(bufnr, "n", "<leader>lr", vim.lsp.buf.rename, { desc = "Rename symbol" })
  end
  bufmap(bufnr, "n", "<leader>lf", function()
    vim.cmd.Format()
  end, { desc = "Format buffer" })
  bufmap(bufnr, "n", "gl", vim.diagnostic.open_float, { desc = "Line diagnostics" })
  bufmap(bufnr, "n", "[d", function()
    vim.diagnostic.jump({ count = -1, float = { border = "rounded" } })
  end, { desc = "Previous diagnostic" })
  bufmap(bufnr, "n", "]d", function()
    vim.diagnostic.jump({ count = 1, float = { border = "rounded" } })
  end, { desc = "Next diagnostic" })
  bufmap(bufnr, "n", "<leader>q", vim.diagnostic.setloclist, { desc = "Diagnostics to loclist" })

  -- Who calls this / what does this call. Advertised by gopls, lua_ls and the
  -- TypeScript server, and unmapped until now.
  if has("textDocument/prepareCallHierarchy") then
    bufmap(bufnr, "n", "<leader>lci", vim.lsp.buf.incoming_calls, { desc = "Incoming calls" })
    bufmap(bufnr, "n", "<leader>lco", vim.lsp.buf.outgoing_calls, { desc = "Outgoing calls" })
  end

  -- Syntax-aware expand/shrink selection, straight from the server's AST — the
  -- same idea as nvim-treesitter's incremental selection, which this config
  -- never enabled.
  if has("textDocument/selectionRange") then
    bufmap(bufnr, { "n", "x" }, "<M-o>", function()
      vim.lsp.buf.selection_range(1)
    end, { desc = "Expand selection" })
    bufmap(bufnr, "x", "<M-i>", function()
      vim.lsp.buf.selection_range(-1)
    end, { desc = "Shrink selection" })
  end
end

function M.common_on_attach(client, bufnr)
  lsp_keymaps(client, bufnr)
  lsp_highlight_document(client, bufnr)
  lsp_codelens(client, bufnr)
end

function M.common_capabilities()
  local capabilities = vim.lsp.protocol.make_client_capabilities()
  capabilities.textDocument.completion.completionItem.insertReplaceSupport = false
  capabilities.textDocument.completion.completionItem.preselectSupport = true
  capabilities.textDocument.codeLens = { dynamicRegistration = false }
  capabilities.textDocument.completion.completionItem.snippetSupport = true
  capabilities.textDocument.completion.completionItem.resolveSupport = {
    properties = {
      "documentation",
      "detail",
      "additionalTextEdits",
    },
  }

  local status_ok, cmp_nvim_lsp = pcall(require, "cmp_nvim_lsp")
  if status_ok then
    capabilities = cmp_nvim_lsp.default_capabilities(capabilities)
  end

  return capabilities
end

-- Tailwind's "Replace with" quickfixes, applied without a prompt. Everything
-- about the wire format (params, diagnostics, edit application, ordering) lives
-- in rielj.lsp.action; this only says which actions to take.
local function is_replace_with(action)
  return action.title ~= nil and action.title:match("^Replace with") ~= nil
end

-- Apply all Tailwind CSS "Replace with" actions on the current line
function M.apply_all_tailwind_actions()
  require("rielj.lsp.action").apply({
    client = "tailwindcss",
    range = "cursor",
    filter = is_replace_with,
    reverse = true,
    notify = true,
  })
end

-- Apply all Tailwind CSS "Replace with" actions in the whole buffer
function M.apply_all_tailwind_actions_buffer()
  require("rielj.lsp.action").apply({
    client = "tailwindcss",
    range = "buffer",
    filter = is_replace_with,
    reverse = true,
    notify = true,
  })
end

return M
