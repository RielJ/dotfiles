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

local function lsp_keymaps(bufnr)
  local bufmap = require("rielj.keymap").bufmap

  bufmap(bufnr, "n", "gD", vim.lsp.buf.declaration, { desc = "Go to declaration" })
  bufmap(bufnr, "n", "gd", vim.lsp.buf.definition, { desc = "Go to definition" })
  bufmap(bufnr, "n", "gi", vim.lsp.buf.implementation, { desc = "Go to implementation" })
  bufmap(bufnr, "n", "gr", vim.lsp.buf.references, { desc = "References" })
  bufmap(bufnr, "n", "K", vim.lsp.buf.hover, { desc = "Hover" })
  bufmap(bufnr, "n", "<C-k>", vim.lsp.buf.signature_help, { desc = "Signature help" })
  bufmap(bufnr, "n", "<leader>lr", function()
    vim.lsp.buf.rename(nil, { filter = M.rename_filter })
  end, { desc = "Rename symbol" })
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
end

function M.common_on_attach(client, bufnr)
  lsp_keymaps(bufnr)
  lsp_highlight_document(client, bufnr)
end

--- Only offer rename to clients that implement it.
---
--- Note the colon: `client.supports_method(...)` passes the method name as
--- `self`, which throws and made the pcall below swallow every client.
function M.rename_filter(clients)
  return vim.tbl_filter(function(client)
    return client:supports_method("textDocument/rename")
  end, clients)
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
