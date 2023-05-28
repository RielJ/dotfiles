require("rielj.theme").tokyonight()

local colorscheme = "tokyonight-night"

local status_ok, _ = pcall(vim.cmd, "colorscheme " .. colorscheme)
if not status_ok then
  vim.notify("colorscheme " .. colorscheme .. " not found!")
  return
end

-- require("transparent").setup({
--   groups = { -- table: default groups
--     "Normal",
--     "NormalNC",
--     "Comment",
--     "Constant",
--     "Special",
--     "Identifier",
--     "Statement",
--     "PreProc",
--     "Type",
--     "Underlined",
--     "Todo",
--     "String",
--     "Function",
--     "Conditional",
--     "Repeat",
--     "Operator",
--     "Structure",
--     "LineNr",
--     "NonText",
--     "SignColumn",
--     "CursorLineNr",
--     "EndOfBuffer",
--   },
--   extra_groups = {}, -- table: additional groups that should be cleared
--   exclude_groups = {}, -- table: groups you don't want to clear
-- })

-- vim.g.transparent_groups = vim.list_extend(
--   vim.g.transparent_groups or {},
--   vim.tbl_map(function(v)
--     return v.hl_group
--   end, vim.tbl_values(require("bufferline.config").highlights))
-- )
