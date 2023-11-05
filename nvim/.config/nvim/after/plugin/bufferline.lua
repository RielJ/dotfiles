vim.g.termguicolors = true
local bufferline = require("bufferline")

local function is_ft(b, ft)
  return vim.bo[b].filetype == ft
end

local function diagnostics_indicator(num, _, diagnostics, _)
  local result = {}
  local symbols = {
    error = "",
    warning = "",
    info = "",
  }
  -- if not lvim.use_icons then
  --   return "(" .. num .. ")"
  -- end
  for name, count in pairs(diagnostics) do
    if symbols[name] and count > 0 then
      table.insert(result, symbols[name] .. " " .. count)
    end
  end
  result = table.concat(result, " ")
  return #result > 0 and result or ""
end

local function custom_filter(buf, buf_nums)
  local logs = vim.tbl_filter(function(b)
    return is_ft(b, "log")
  end, buf_nums or {})
  if vim.tbl_isempty(logs) then
    return true
  end
  local tab_num = vim.fn.tabpagenr()
  local last_tab = vim.fn.tabpagenr "$"
  local is_log = is_ft(buf, "log")
  if last_tab == 1 then
    return true
  end
  -- only show log buffers in secondary tabs
  return (tab_num == last_tab and is_log) or (tab_num ~= last_tab and not is_log)
end

bufferline.setup({
  highlights = {
    background = {
      italic = true,
    },
    buffer_selected = {
      bold = true,
    },
  },
  options = {
    mode = "buffers", -- set to "tabs" to only show tabpages instead
    numbers = "none", -- can be "none" | "ordinal" | "buffer_id" | "both" | function
    -- close_command = function(bufnr) -- can be a string | function, see "Mouse actions"
    --   M.buf_kill("bd", bufnr, false)
    -- end,
    right_mouse_command = "vert sbuffer %d", -- can be a string | function, see "Mouse actions"
    left_mouse_command = "buffer %d",        -- can be a string | function, see "Mouse actions"
    middle_mouse_command = nil,              -- can be a string | function, see "Mouse actions"
    -- indicator = {
    --   icon = lvim.icons.ui.BoldLineLeft, -- this should be omitted if indicator style is not 'icon'
    --   style = "icon", -- can also be 'underline'|'none',
    -- },
    -- buffer_close_icon = lvim.icons.ui.Close,
    -- modified_icon = lvim.icons.ui.Circle,
    -- close_icon = lvim.icons.ui.BoldClose,
    -- left_trunc_marker = lvim.icons.ui.ArrowCircleLeft,
    -- right_trunc_marker = lvim.icons.ui.ArrowCircleRight,
    --- name_formatter can be used to change the buffer's label in the bufferline.
    --- Please note some names can/will break the
    --- bufferline so use this at your discretion knowing that it has
    --- some limitations that will *NOT* be fixed.
    name_formatter = function(buf) -- buf contains a "name", "path" and "bufnr"
      -- remove extension from markdown files for example
      if buf.name:match "%.md" then
        return vim.fn.fnamemodify(buf.name, ":t:r")
      end
    end,
    max_name_length = 18,
    max_prefix_length = 15, -- prefix used when a buffer is de-duplicated
    truncate_names = true,  -- whether or not tab names should be truncated
    tab_size = 18,
    diagnostics = "nvim_lsp",
    diagnostics_update_in_insert = false,
    diagnostics_indicator = diagnostics_indicator,
    -- NOTE: this will be called a lot so don't do any heavy processing here
    custom_filter = custom_filter,
    offsets = {
      {
        filetype = "undotree",
        text = "Undotree",
        highlight = "PanelHeading",
        padding = 1,
      },
      {
        filetype = "NvimTree",
        text = "Explorer",
        highlight = "PanelHeading",
        padding = 1,
      },
      {
        filetype = "DiffviewFiles",
        text = "Diff View",
        highlight = "PanelHeading",
        padding = 1,
      },
      {
        filetype = "flutterToolsOutline",
        text = "Flutter Outline",
        highlight = "PanelHeading",
      },
      {
        filetype = "lazy",
        text = "Lazy",
        highlight = "PanelHeading",
        padding = 1,
      },
    },
    color_icons = true, -- whether or not to add the filetype icon highlights
    -- show_buffer_icons = lvim.use_icons, -- disable filetype icons for buffers
    -- show_buffer_close_icons = lvim.use_icons,
    show_close_icon = false,
    show_tab_indicators = true,
    persist_buffer_sort = true, -- whether or not custom sorted buffers should persist
    -- can also be a table containing 2 custom separators
    -- [focused and unfocused]. eg: { '|', '|' }
    separator_style = "thin",
    enforce_regular_tabs = false,
    always_show_bufferline = true,
    hover = {
      enabled = false, -- requires nvim 0.8+
      delay = 200,
      reveal = { "close" },
    },
    sort_by = "insert_after_current",
    style_preset = bufferline.style_preset.default, -- or bufferline.style_preset.minimal,
    -- left_mouse_command = "buffer %d",               -- can be a string | function, see "Mouse actions"
    -- name_formatter = function(buf)                  -- buf contains a "name", "path" and "bufnr"
    --   -- remove extension from markdown files for example
    --   if buf.name:match("%.md") then
    --     return vim.fn.fnamemodify(buf.name, ":t:r")
    --   end
    -- end,
    -- diagnostics_indicator = diagnostics_indicator,
    -- -- NOTE: this will be called a lot so don't do any heavy processing here
    -- color_icons = true,         -- whether or not to add the filetype icon highlights
    -- persist_buffer_sort = true, -- whether or not custom sorted buffers should persist
    -- hover = {
    --   enabled = false,          -- requires nvim 0.8+
    --   delay = 200,
    --   reveal = { "close" },
    -- },
    -- sort_by = "id",

    -- mode = "buffers",
    -- numbers = "none",
    themable = true,
    close_command = "bdelete! %d",
    -- right_mouse_command = "sbuffer %d",
    -- middle_mouse_command = "vertical sbuffer %d",
    indicator = {
      icon = "▎",
      style = "icon",
    },
    -- name_formatter = function (buf)
    --
    -- end,
    buffer_close_icon = "",
    modified_icon = "",
    close_icon = "",
    -- truncate_names = true,
    left_trunc_marker = "",
    right_trunc_marker = "",
    -- max_name_length = 14,
    -- max_prefix_length = 13,
    -- tab_size = 20,
    view = "multiwindow",
    -- diagnostics = "nvim_lsp",
    -- diagnostics_update_in_insert = true,
    -- diagnostics_indicator = function(count, level, diagnostics_dict, context)
    -- 	return "(" .. count .. ")"
    -- end,
    -- offsets = { { filetype = "NvimTree", separator = false } },
    -- separator_style = "thin",
    show_buffer_icons = true,
    show_buffer_close_icons = true,
    -- show_close_icon = true,
    -- show_tab_indicators = true,
    -- enforce_regular_tabs = false,
    -- always_show_bufferline = true,
    -- custom_filter = function(buf_number)
    --   -- Func to filter out our managed/persistent split terms
    --   local present_type, type = pcall(function()
    --     return vim.api.nvim_buf_get_var(buf_number, "term_type")
    --   end)

    --   if present_type then
    --     if type == "vert" then
    --       return false
    --     elseif type == "hori" then
    --       return false
    --     end
    --     return true
    --   end

    --   return true
    -- end,
  },
})
