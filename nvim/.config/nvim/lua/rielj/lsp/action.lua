-- rielj.lsp.action
--
-- One module owning the LSP code-action wire format. Callers say *what* they
-- want applied; everything below the seam (params, diagnostic conversion,
-- codeAction/resolve, command-vs-edit dispatch, offset encoding) lives here.
--
-- Why this exists: three call sites used to hand-roll these params, and each
-- had to independently know that `vim.diagnostic.get()` returns Neovim-shaped
-- diagnostics (lnum/col) while the wire format requires `range`. Strict servers
-- such as tsc (TypeScript 7, Go/lsproto) reject the Neovim shape outright.

local M = {}

---@class rielj.lsp.action.Opts
---@field bufnr? integer            Buffer to act on (default: current)
---@field kind? string|string[]     Code action kind(s), e.g. "source.organizeImports"
---@field client? string            Restrict to a single client name, e.g. "tsc"
---@field range? "buffer"|"cursor"  Range to request actions for (default: "buffer")
---@field filter? fun(action: table, client: vim.lsp.Client): boolean
---@field select? fun(actions: table[], client: vim.lsp.Client): table[]
---                             Choose among the filtered actions. Runs once with
---                             the whole matched list, so callers can prefer one
---                             action over another ("apply the batch fix if the
---                             server offered one, else the first single fix").
---@field sync? boolean             Block until applied (required on BufWritePre)
---@field reverse? boolean          Apply bottom-up, so earlier edits don't shift later ones
---@field timeout_ms? integer       Sync timeout (default: 3000)
---@field notify? boolean           Notify when nothing matched (default: false)

local METHOD = "textDocument/codeAction"
local RESOLVE = "codeAction/resolve"

--- Character offset of the end of `line` in the client's encoding.
---@param line string
---@param encoding string
---@return integer
local function end_character(line, encoding)
  if encoding == "utf-8" or not line or line == "" then
    return #line
  end
  local ok, col = pcall(vim.str_utfindex, line, encoding)
  return ok and col or #line
end

--- Buffer diagnostics in the LSP wire shape.
---@param bufnr integer
---@param lnum? integer 0-indexed line to restrict to
---@return table[]
local function lsp_diagnostics(bufnr, lnum)
  local diagnostics = vim.diagnostic.get(bufnr, lnum and { lnum = lnum } or nil)
  if vim.lsp.diagnostic and vim.lsp.diagnostic.from then
    return vim.lsp.diagnostic.from(diagnostics)
  end
  -- Fallback for older Neovim: convert by hand rather than send the wrong shape.
  return vim.tbl_map(function(d)
    return {
      range = {
        start = { line = d.lnum, character = d.col },
        ["end"] = { line = d.end_lnum or d.lnum, character = d.end_col or d.col },
      },
      severity = d.severity,
      code = d.code,
      source = d.source,
      message = d.message,
    }
  end, diagnostics)
end

--- Request params for one client.
---@param client vim.lsp.Client
---@param bufnr integer
---@param opts rielj.lsp.action.Opts
---@return table
local function make_params(client, bufnr, opts)
  local encoding = client.offset_encoding or "utf-16"
  local range, lnum

  if opts.range == "cursor" then
    local row, col = unpack(vim.api.nvim_win_get_cursor(0))
    lnum = row - 1
    range = {
      start = { line = lnum, character = col },
      ["end"] = { line = lnum, character = col },
    }
  else
    local line_count = vim.api.nvim_buf_line_count(bufnr)
    local last_line = vim.api.nvim_buf_get_lines(bufnr, line_count - 1, line_count, false)[1] or ""
    range = {
      start = { line = 0, character = 0 },
      ["end"] = { line = line_count - 1, character = end_character(last_line, encoding) },
    }
  end

  local only = opts.kind
  if type(only) == "string" then
    only = { only }
  end

  return {
    textDocument = vim.lsp.util.make_text_document_params(bufnr),
    range = range,
    context = {
      diagnostics = lsp_diagnostics(bufnr, lnum),
      only = only,
      triggerKind = vim.lsp.protocol.CodeActionTriggerKind.Invoked,
    },
  }
end

--- Clients that can answer a code-action request for this buffer.
---@param bufnr integer
---@param name? string
---@return vim.lsp.Client[]
local function action_clients(bufnr, name)
  return vim.tbl_filter(function(client)
    return client:supports_method(METHOD, bufnr)
  end, vim.lsp.get_clients({ bufnr = bufnr, name = name }))
end

--- Apply a single resolved action: edit first, then command.
---@param action table
---@param client vim.lsp.Client
---@param bufnr integer
local function apply_one(action, client, bufnr)
  if action.edit then
    vim.lsp.util.apply_workspace_edit(action.edit, client.offset_encoding or "utf-16")
  end
  if action.command then
    -- `action` may be a Command (command is a string) or a CodeAction
    -- (command is a Command object).
    local command = type(action.command) == "table" and action.command or action
    client:exec_cmd(command, { bufnr = bufnr })
  end
end

--- Position of an action's first text edit, for bottom-up ordering.
---@param action table
---@return integer line, integer character
local function first_edit_position(action)
  local edit = action.edit
  if edit then
    if edit.changes then
      for _, edits in pairs(edit.changes) do
        if edits[1] then
          return edits[1].range.start.line, edits[1].range.start.character
        end
      end
    end
    if edit.documentChanges then
      for _, change in ipairs(edit.documentChanges) do
        local edits = change.edits
        if edits and edits[1] then
          return edits[1].range.start.line, edits[1].range.start.character
        end
      end
    end
  end
  return -1, -1
end

--- Apply a list of actions, optionally bottom-up.
---@param actions table[]
---@param client vim.lsp.Client
---@param bufnr integer
---@param reverse? boolean
local function apply_all(actions, client, bufnr, reverse)
  if reverse then
    table.sort(actions, function(a, b)
      local a_line, a_char = first_edit_position(a)
      local b_line, b_char = first_edit_position(b)
      if a_line ~= b_line then
        return a_line > b_line
      end
      return a_char > b_char
    end)
  end
  for _, action in ipairs(actions) do
    apply_one(action, client, bufnr)
  end
end

--- Fill in a lazily-computed edit via codeAction/resolve.
---@param action table
---@param client vim.lsp.Client
---@param bufnr integer
---@param timeout_ms integer
---@return table
local function resolve(action, client, bufnr, timeout_ms)
  if action.edit or action.command or not client:supports_method(RESOLVE, bufnr) then
    return action
  end
  local response = client:request_sync(RESOLVE, action, timeout_ms, bufnr)
  if response and not response.err and response.result then
    return response.result
  end
  return action
end

--- Apply every code action matching `opts`, across every attached client.
---
--- Async by default; pass `sync = true` when the caller must not return before
--- the buffer is edited (BufWritePre, :Format, scripted fixes).
---@param opts rielj.lsp.action.Opts
---@return integer applied Number of actions applied (always 0 when async)
function M.apply(opts)
  opts = opts or {}
  local bufnr = opts.bufnr or vim.api.nvim_get_current_buf()
  local timeout_ms = opts.timeout_ms or 3000
  local clients = action_clients(bufnr, opts.client)

  if #clients == 0 then
    if opts.notify then
      vim.notify("No LSP client supports code actions here", vim.log.levels.WARN)
    end
    return 0
  end

  local function accept(action, client)
    if opts.filter then
      return opts.filter(action, client) and true or false
    end
    return true
  end

  --- Narrow the matched set, then resolve only what will actually be applied.
  ---@param matched table[]
  ---@param client vim.lsp.Client
  ---@return table[]
  local function choose(matched, client)
    if opts.select then
      matched = opts.select(matched, client) or {}
    end
    return vim.tbl_map(function(a)
      return resolve(a, client, bufnr, timeout_ms)
    end, matched)
  end

  local applied = 0

  for _, client in ipairs(clients) do
    local params = make_params(client, bufnr, opts)

    if opts.sync then
      local response = client:request_sync(METHOD, params, timeout_ms, bufnr)
      if response and response.err then
        vim.notify("Code action failed: " .. tostring(response.err.message), vim.log.levels.ERROR)
      elseif response and response.result then
        local matched = {}
        for _, action in ipairs(response.result) do
          if accept(action, client) then
            table.insert(matched, action)
          end
        end
        matched = choose(matched, client)
        apply_all(matched, client, bufnr, opts.reverse)
        applied = applied + #matched
      end
    else
      client:request(METHOD, params, function(err, result)
        if err then
          vim.notify("Code action failed: " .. (err.message or vim.inspect(err)), vim.log.levels.ERROR)
          return
        end
        if not result or #result == 0 then
          if opts.notify then
            vim.notify("No code actions for: " .. vim.inspect(opts.kind), vim.log.levels.INFO)
          end
          return
        end
        local matched = {}
        for _, action in ipairs(result) do
          if accept(action, client) then
            table.insert(matched, action)
          end
        end
        matched = choose(matched, client)
        if #matched == 0 and opts.notify then
          vim.notify("No matching code actions", vim.log.levels.INFO)
        end
        apply_all(matched, client, bufnr, opts.reverse)
      end, bufnr)
    end
  end

  return applied
end

--- Convenience wrapper: a callback that applies `kind` to the current buffer.
---@param kind string|string[]
---@param opts? rielj.lsp.action.Opts
---@return fun()
function M.applier(kind, opts)
  return function()
    M.apply(vim.tbl_extend("force", { kind = kind, notify = true }, opts or {}, { kind = kind }))
  end
end

return M
