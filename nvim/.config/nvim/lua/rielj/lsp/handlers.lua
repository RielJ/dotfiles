local M = {}

-- TODO: backfill this to template
M.setup = function()
  local signs = {
    { name = "DiagnosticSignError", text = "" },
    { name = "DiagnosticSignWarn", text = "" },
    { name = "DiagnosticSignHint", text = "" },
    { name = "DiagnosticSignInfo", text = "" },
  }

  for _, sign in ipairs(signs) do
    vim.fn.sign_define(sign.name, { texthl = sign.name, text = sign.text, numhl = "" })
  end

  local config = {
    -- disable virtual text
    virtual_text = false,
    -- show signs
    signs = {
      -- active = signs,
      text = {
        [vim.diagnostic.severity.ERROR] = "",
        [vim.diagnostic.severity.WARN] = "",
        [vim.diagnostic.severity.INFO] = "",
        [vim.diagnostic.severity.HINT] = "",
      }
    },
    update_in_insert = true,
    underline = true,
    severity_sort = true,
    float = {
      focusable = false,
      style = "minimal",
      border = "rounded",
      source = "always",
      header = "",
      prefix = "",
    },
  }

  vim.diagnostic.config(config)

  vim.lsp.handlers["textDocument/hover"] = vim.lsp.with(vim.lsp.handlers.hover, {
    border = "rounded",
  })

  vim.lsp.handlers["textDocument/signatureHelp"] = vim.lsp.with(vim.lsp.handlers.signature_help, {
    border = "rounded",
  })

  M.common_capabilities()
end

local function lsp_highlight_document(client, bufnr)
  -- Set autocommands conditional on server_capabilities
  local augroup_highlight = vim.api.nvim_create_augroup("custom-lsp-references", { clear = true })
  if client.server_capabilities.document_highlight then
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

function M.rename_filter(clients)
  return vim.tbl_filter(function(client)
    local status_ok, renaming_supportedd = pcall(function()
      return client.supports_method("textDocument/rename")
    end)
    return status_ok and renaming_supportedd and client.name ~= "null-ls"
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

function M.get_common_opts()
  return {
    on_attach = M.common_on_attach,
    capabilities = M.common_capabilities,
  }
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
