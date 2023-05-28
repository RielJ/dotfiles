---@diagnostic disable-next-line: unused-function, unused-local
local function sort_by_mtime(a, b)
  local astat = vim.loop.fs_stat(a.path)
  local bstat = vim.loop.fs_stat(b.path)
  local mod_a = astat and astat.mtime.sec or 0
  local mod_b = bstat and bstat.mtime.sec or 0
  return mod_a > mod_b
end

require("bufferline").setup({
  options = {
    numbers = "none",
    themable = true,
    close_command = "bdelete! %d",
    right_mouse_command = "sbuffer %d",
    middle_mouse_command = "vertical sbuffer %d",
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
    truncate_names = true,
    left_trunc_marker = "",
    right_trunc_marker = "",
    max_name_length = 14,
    max_prefix_length = 13,
    tab_size = 20,
    view = "multiwindow",
    diagnostics = "nvim_lsp",
    diagnostics_update_in_insert = true,
    -- diagnostics_indicator = function(count, level, diagnostics_dict, context)
    -- 	return "(" .. count .. ")"
    -- end,
    offsets = { { filetype = "NvimTree", separator = false } },
    separator_style = "thin",
    show_buffer_icons = true,
    show_buffer_close_icons = true,
    show_close_icon = true,
    show_tab_indicators = true,
    enforce_regular_tabs = false,
    always_show_bufferline = true,
    custom_filter = function(buf_number)
      -- Func to filter out our managed/persistent split terms
      local present_type, type = pcall(function()
        return vim.api.nvim_buf_get_var(buf_number, "term_type")
      end)

      if present_type then
        if type == "vert" then
          return false
        elseif type == "hori" then
          return false
        end
        return true
      end

      return true
    end,
  },
})
