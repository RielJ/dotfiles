-- rielj.keymap
--
-- The one seam every keymap in this config goes through. Because every bind
-- passes here, this module can answer questions no individual call site could:
-- which key is already taken, who took it, and where that happened.
--
-- Global binds are registered and checked for collisions. Buffer-local binds
-- (LSP on_attach, filetype maps) intentionally shadow globals, so they are
-- recorded but never warned about.

local M = {}

---@class rielj.keymap.Entry
---@field mode string
---@field lhs string
---@field desc? string
---@field source string  "file:line" of the call site

---@type table<string, rielj.keymap.Entry>
local registry = {}

---@type rielj.keymap.Entry[]
local collisions = {}

--- Where the caller of `map`/`bufmap` lives, for collision reports.
---@param level integer
---@return string
local function call_site(level)
  local info = debug.getinfo(level, "Sl")
  if not info then
    return "?"
  end
  return string.format("%s:%d", vim.fn.fnamemodify(info.short_src, ":~:."), info.currentline)
end

---@param modes string|string[]
---@return string[]
local function as_list(modes)
  if type(modes) == "string" then
    return { modes }
  end
  return modes
end

--- Bind a global key.
---@param modes string|string[]
---@param lhs string
---@param rhs string|function
---@param opts? table  Standard vim.keymap.set opts; `desc` is strongly encouraged
function M.map(modes, lhs, rhs, opts)
  opts = vim.tbl_extend("force", { noremap = true, silent = true }, opts or {})
  local source = call_site(3)

  for _, mode in ipairs(as_list(modes)) do
    local key = mode .. " " .. lhs
    local previous = registry[key]
    if previous then
      table.insert(collisions, {
        mode = mode,
        lhs = lhs,
        desc = opts.desc,
        source = string.format("%s overrides %s", source, previous.source),
      })
    end
    registry[key] = { mode = mode, lhs = lhs, desc = opts.desc, source = source }
    vim.keymap.set(mode, lhs, rhs, opts)
  end
end

--- Bind a buffer-local key. Shadowing a global map here is expected, so these
--- never count as collisions.
---@param bufnr integer
---@param modes string|string[]
---@param lhs string
---@param rhs string|function
---@param opts? table
function M.bufmap(bufnr, modes, lhs, rhs, opts)
  opts = vim.tbl_extend("force", { noremap = true, silent = true, buffer = bufnr }, opts or {})
  for _, mode in ipairs(as_list(modes)) do
    vim.keymap.set(mode, lhs, rhs, opts)
  end
end

--- Every global bind made through this module.
---@return rielj.keymap.Entry[]
function M.registered()
  return vim.tbl_values(registry)
end

--- Global binds that were defined more than once.
---@return rielj.keymap.Entry[]
function M.collisions()
  return collisions
end

vim.api.nvim_create_user_command("KeymapCollisions", function()
  if #collisions == 0 then
    vim.notify("No keymap collisions", vim.log.levels.INFO)
    return
  end
  local lines = vim.tbl_map(function(entry)
    return string.format("%s %s — %s", entry.mode, entry.lhs, entry.source)
  end, collisions)
  vim.notify(table.concat(lines, "\n"), vim.log.levels.WARN)
end, { desc = "List keymaps bound more than once" })

-- Report collisions once, after every startup file has had its say.
vim.api.nvim_create_autocmd("VimEnter", {
  once = true,
  callback = function()
    if #collisions > 0 then
      vim.notify(string.format("%d keymap collision(s) — :KeymapCollisions", #collisions), vim.log.levels.WARN)
    end
  end,
})

return M
