-- Commenting, on top of Neovim's built-in support.
--
-- Core (0.10+) provides `gc`, `gcc` and the `gc` textobject, and resolves
-- 'commentstring' through treesitter capture metadata — which means JSX inside
-- a `.tsx` file correctly becomes `{/* … */}` with no plugin involved. That
-- replaced both Comment.nvim and nvim-ts-context-commentstring here.
--
-- The one behaviour core does not have is Comment.nvim's `ignore = "^$"`:
-- commenting a block puts a bare comment marker on every blank line inside it.
-- This module wraps the core operator to restore blank lines afterwards.
--
-- Everything else is core's, reused rather than reimplemented: the actual
-- toggle, commentstring resolution, dot-repeat and the textobject.

local M = {}

--- Lines that were blank before the toggle, as a lookup keyed by line number.
---@param from integer 1-based, inclusive
---@param to integer 1-based, inclusive
---@return table<integer, true>
local function blank_lines(from, to)
  local blanks = {}
  for i, line in ipairs(vim.api.nvim_buf_get_lines(0, from - 1, to, false)) do
    if line:find("^%s*$") then
      blanks[from + i - 1] = true
    end
  end
  return blanks
end

--- Toggle comments over a line range, leaving blank lines untouched.
---
--- Restoring after the fact is deliberate: core decides *whether* the range is
--- currently commented by looking at non-blank lines only, so excluding blanks
--- up front would not change that decision, only the edit.
---@param from integer
---@param to integer
local function toggle_range(from, to)
  local blanks = blank_lines(from, to)

  require("vim._comment").toggle_lines(from, to, vim.api.nvim_win_get_cursor(0))

  if next(blanks) == nil then
    return
  end
  vim._with({ lockmarks = true }, function()
    for lnum in pairs(blanks) do
      vim.api.nvim_buf_set_lines(0, lnum - 1, lnum, false, { "" })
    end
  end)
end

--- `operatorfunc`, and the expression half of the `gc` mapping.
---
--- Called with no argument by the mapping (returns `g@` to start the operator),
--- then again by Neovim with the motion kind once the motion is known.
---@param mode string? "line" | "char" | "block"
---@return string
function M.operator(mode)
  if mode == nil then
    vim.o.operatorfunc = "v:lua.require'rielj.comment'.operator"
    return "g@"
  end

  local from, from_col = vim.fn.line("'["), vim.fn.col("'[")
  local to, to_col = vim.fn.line("']"), vim.fn.col("']")

  -- Empty textobject: the marks come back inverted.
  if from > to or (from == to and from_col > to_col) then
    return ""
  end

  toggle_range(from, to)
  return ""
end

function M.setup()
  local map = require("rielj.keymap").map

  map({ "n", "x" }, "gc", M.operator, { expr = true, desc = "Toggle comment" })
  map("n", "gcc", function()
    return M.operator() .. "_"
  end, { expr = true, desc = "Toggle comment line" })

  -- Core's textobject needs no wrapping: it only selects existing comments.
  map("o", "gc", function()
    require("vim._comment").textobject()
  end, { desc = "Comment textobject" })
end

return M
