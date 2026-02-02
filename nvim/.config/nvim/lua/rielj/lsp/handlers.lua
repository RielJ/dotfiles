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
  local opts = { noremap = true, silent = true }
  vim.api.nvim_buf_set_keymap(bufnr, "n", "gD", "<cmd>lua vim.lsp.buf.declaration()<CR>", opts)
  vim.api.nvim_buf_set_keymap(bufnr, "n", "gd", "<cmd>lua vim.lsp.buf.definition()<CR>", opts)
  vim.api.nvim_buf_set_keymap(bufnr, "n", "K", "<cmd>lua vim.lsp.buf.hover()<CR>", opts)
  vim.api.nvim_buf_set_keymap(bufnr, "n", "gi", "<cmd>lua vim.lsp.buf.implementation()<CR>", opts)
  vim.api.nvim_buf_set_keymap(bufnr, "n", "<C-k>", "<cmd>lua vim.lsp.buf.signature_help()<CR>", opts)
  -- vim.api.nvim_buf_set_keymap(bufnr, "n", "gP", "<cmd>require('rielj.lsp.peek)<CR>", opts)
  vim.api.nvim_buf_set_keymap(bufnr, "n", "<leader>lr",
    "<ESC><CMD>lua vim.lsp.buf.rename(nil, {filter = require('rielj.lsp.handlers').rename_filter})<CR>", opts)
  vim.api.nvim_buf_set_keymap(bufnr, "n", "gr", "<cmd>lua vim.lsp.buf.references()<CR>", opts)
  -- vim.api.nvim_buf_set_keymap(bufnr, "n", "<leader>lf", "<cmd>lua require('rielj.lsp.handlers').format()<CR>", opts)
  vim.api.nvim_buf_set_keymap(bufnr, "n", "<leader>lf", "<cmd>lua vim.cmd.Format()<CR>", opts)
  -- vim.api.nvim_buf_set_keymap(bufnr, "n", "<leader>f", "<cmd>lua vim.diagnostic.open_float()<CR>", opts)
  vim.api.nvim_buf_set_keymap(bufnr, "n", "[d", '<cmd>lua vim.diagnostic.goto_prev({ border = "rounded" })<CR>', opts)
  vim.api.nvim_buf_set_keymap(
    bufnr,
    "n",
    "gl",
    '<cmd>lua vim.lsp.diagnostic.show_line_diagnostics({ border = "rounded" })<CR>',
    opts
  )
  vim.api.nvim_buf_set_keymap(bufnr, "n", "]d", '<cmd>lua vim.diagnostic.goto_next({ border = "rounded" })<CR>', opts)
  vim.api.nvim_buf_set_keymap(bufnr, "n", "<leader>q", "<cmd>lua vim.diagnostic.setloclist()<CR>", opts)
end

function M.common_on_attach(client, bufnr)
  -- local augroup_format = vim.api.nvim_create_augroup("custom-lsp-format", { clear = true })
  -- if vim.lsp.handlers["textDocument/formatting"] and client.name ~= "typescript-tools" then
  -- vim.api.nvim_clear_autocmds({ group = augroup_format, buffer = bufnr })
  -- vim.api.nvim_create_autocmd("BufWritePre", {
  --   group = augroup_format,
  --   buffer = bufnr,
  --   callback = function()
  --     -- on 0.8, you should use vim.lsp.buf.format({ bufnr = bufnr }) instead
  --     M.format({ { filter = M.format_filter, bufnr = bufnr } })
  --   end,
  -- })
  -- end
  lsp_keymaps(bufnr)
  lsp_highlight_document(client, bufnr)
end

function M.format_filter(clients)
  return vim.tbl_filter(function(client)
    local status_ok, formatting_supported = pcall(function()
      return client.supports_method("textDocument/formatting")
    end)
    -- give higher prio to null-ls
    if status_ok and formatting_supported and client.name == "null-ls" then
      return true
    else
      return status_ok and formatting_supported and client.name
    end
  end, clients)
end

function M.rename_filter(clients)
  return vim.tbl_filter(function(client)
    local status_ok, renaming_supportedd = pcall(function()
      return client.supports_method("textDocument/rename")
    end)
    return status_ok and renaming_supportedd and client.name ~= "null-ls"
  end, clients)
end

---Provide vim.lsp.buf.format for nvim <0.8
---@param opts table
function M.format(opts)
  opts = opts or { filter = M.format_filter }

  if vim.lsp.buf.format then
    return vim.lsp.buf.format(opts)
  end

  local bufnr = opts.bufnr or vim.api.nvim_get_current_buf()
  local clients = vim.lsp.get_clients({ bufnr })

  if opts.filter then
    clients = opts.filter(clients)
  elseif opts.id then
    clients = vim.tbl_filter(function(client)
      return client.id == opts.id
    end, clients)
  elseif opts.name then
    clients = vim.tbl_filter(function(client)
      return client.name == opts.name
    end, clients)
  end

  clients = vim.tbl_filter(function(client)
    return client.supports_method("textDocument/formatting")
  end, clients)

  if #clients == 0 then
    vim.notify("[LSP] Format request failed, no matching language servers.")
  end

  local timeout_ms = opts.timeout_ms or 1000
  for _, client in pairs(clients) do
    local params = vim.lsp.util.make_formatting_params(opts.formatting_options)
    local result, err = client.request_sync("textDocument/formatting", params, timeout_ms, bufnr)
    if result and result.result then
      vim.lsp.util.apply_text_edits(result.result, bufnr, client.offset_encoding)
    elseif err then
      vim.notify(string.format("[LSP][%s] %s", client.name, err), vim.log.levels.WARN)
    end
  end
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

-- Helper function to collect and apply Tailwind edits
local function collect_and_apply_tailwind_edits(bufnr, results)
  local all_edits = {}
  local tailwind_client = nil

  for client_id, result in pairs(results) do
    local client = vim.lsp.get_client_by_id(client_id)
    if client and client.name == "tailwindcss" and result.result then
      tailwind_client = client
      for _, action in ipairs(result.result) do
        if action.title and action.title:match("^Replace with") then
          if action.edit then
            -- Handle 'changes' format (uri -> edits[])
            if action.edit.changes then
              for _, edits in pairs(action.edit.changes) do
                for _, edit in ipairs(edits) do
                  table.insert(all_edits, edit)
                end
              end
            end
            -- Handle 'documentChanges' format
            if action.edit.documentChanges then
              for _, change in ipairs(action.edit.documentChanges) do
                if change.edits then
                  for _, edit in ipairs(change.edits) do
                    table.insert(all_edits, edit)
                  end
                elseif change.textEdit then
                  table.insert(all_edits, change.textEdit)
                end
              end
            end
          end
        end
      end
    end
  end

  if not tailwind_client then
    vim.notify("Tailwind CSS LSP not attached", vim.log.levels.WARN)
    return
  end

  if #all_edits == 0 then
    vim.notify("No Tailwind CSS 'Replace with' actions available", vim.log.levels.INFO)
    return
  end

  -- Sort edits by position in reverse order (bottom-right to top-left)
  -- This prevents earlier edits from shifting positions of later edits
  table.sort(all_edits, function(a, b)
    local a_line = a.range.start.line
    local b_line = b.range.start.line
    if a_line ~= b_line then
      return a_line > b_line
    end
    return a.range.start.character > b.range.start.character
  end)

  vim.notify(string.format("Applying %d Tailwind CSS edits...", #all_edits), vim.log.levels.INFO)

  -- Apply each edit manually using nvim_buf_set_text
  for _, edit in ipairs(all_edits) do
    local start_line = edit.range.start.line
    local start_col = edit.range.start.character
    local end_line = edit.range["end"].line
    local end_col = edit.range["end"].character
    local new_text = vim.split(edit.newText, "\n", { plain = true })

    vim.api.nvim_buf_set_text(bufnr, start_line, start_col, end_line, end_col, new_text)
  end
end

-- Apply all Tailwind CSS "Replace with" actions on current line
function M.apply_all_tailwind_actions()
  local bufnr = vim.api.nvim_get_current_buf()

  local context = {
    diagnostics = vim.lsp.diagnostic.get_line_diagnostics(bufnr),
    triggerKind = vim.lsp.protocol.CodeActionTriggerKind.Invoked,
  }

  local params = vim.lsp.util.make_range_params(0, "utf-16")
  params.context = context

  vim.lsp.buf_request_all(bufnr, "textDocument/codeAction", params, function(results)
    collect_and_apply_tailwind_edits(bufnr, results)
  end)
end

-- Apply all Tailwind CSS "suggestCanonicalClasses" fixes in the entire buffer
-- Parses diagnostic messages and applies fixes directly
function M.apply_all_tailwind_actions_buffer()
  local bufnr = vim.api.nvim_get_current_buf()

  -- Get all diagnostics for the buffer
  local all_diagnostics = vim.diagnostic.get(bufnr)

  if #all_diagnostics == 0 then
    vim.notify("No diagnostics found in buffer", vim.log.levels.INFO)
    return
  end

  -- Filter for suggestCanonicalClasses diagnostics and parse the fix
  -- Message format: "The class `X` can be written as `Y`"
  local edits = {}
  for _, diag in ipairs(all_diagnostics) do
    if diag.code == "suggestCanonicalClasses" or (diag.message and diag.message:match("can be written as")) then
      -- Parse the message to extract old and new class names
      local old_class, new_class = diag.message:match("The class `([^`]+)` can be written as `([^`]+)`")
      if old_class and new_class then
        table.insert(edits, {
          lnum = diag.lnum,
          col = diag.col,
          end_lnum = diag.end_lnum or diag.lnum,
          end_col = diag.end_col or (diag.col + #old_class),
          old_class = old_class,
          new_class = new_class,
        })
      end
    end
  end

  if #edits == 0 then
    vim.notify("No Tailwind CSS 'suggestCanonicalClasses' diagnostics found", vim.log.levels.INFO)
    return
  end

  -- Sort edits by position in reverse order (bottom-right to top-left)
  table.sort(edits, function(a, b)
    if a.lnum ~= b.lnum then
      return a.lnum > b.lnum
    end
    return a.col > b.col
  end)

  vim.notify(string.format("Applying %d Tailwind CSS fixes...", #edits), vim.log.levels.INFO)

  -- Apply each edit
  for _, edit in ipairs(edits) do
    vim.api.nvim_buf_set_text(bufnr, edit.lnum, edit.col, edit.end_lnum, edit.end_col, { edit.new_class })
  end
end

return M
