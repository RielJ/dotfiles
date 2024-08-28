local icons = {
  git = {
    added    = " ",
    modified = " ",
    removed  = " ",
  }
}

require("lualine").setup {
  options = {
    theme = "auto",
    globalstatus = vim.o.laststatus == 3,
    disabled_filetypes = { statusline = { "dashboard", "alpha", "ministarter" } },
  },
  sections = {
    lualine_a = { "mode" },
    lualine_b = {
      "branch",
      {
        "diff",
        symbols = {
          added = icons.git.added,
          modified = icons.git.modified,
          removed = icons.git.removed,
        },
        source = function()
          local gitsigns = vim.b.gitsigns_status_dict
          if gitsigns then
            return {
              added = gitsigns.added,
              modified = gitsigns.changed,
              removed = gitsigns.removed,
            }
          end
        end,
      },
    },
    lualine_c = {
      {
        "filetype", icon_only = true, separator = "", padding = { left = 1, right = 0 }
      },
      { "filename", file_status = true, path = 1 },
      {
        "diagnostics",
        sources = { "nvim_lsp" },
        sections = { "error", "warn", "info" },
        color_error = "#ff5555",
        color_warn = "#ffb86c",
        color_info = "#8be9fd",
      },
    },

    lualine_y = {},
    lualine_x = {
      "filetype"
    },
    lualine_z = {
      {
        "progress",
        separator = " ",
        padding = { left = 1, right = 0 }
      },
      { "location", padding = { left = 0, right = 1 } },
    },
  },
  extensions = { "nvim-tree", "lazy" },
}

-- do not add trouble symbols if aerial is enabled
-- if vim.g.trouble_lualine and LazyVim.has("trouble.nvim") then
--   local trouble = require("trouble")
--   local symbols = trouble.statusline
--       and trouble.statusline({
--         mode = "symbols",
--         groups = {},
--         title = false,
--         filter = { range = true },
--         format = "{kind_icon}{symbol.name:Normal}",
--         hl_group = "lualine_c_normal",
--       })
--   table.insert(opts.sections.lualine_c, {
--     symbols and symbols.get,
--     cond = symbols and symbols.has,
--   })
-- end

-- local _, gl = pcall(require, "galaxyline")
-- local condition = require("galaxyline.condition")

-- local gls = gl.section
-- gl.short_line_list = { "NvimTree", "packager", "vista" }

-- -- Colors
-- local colors = {
--   bg = "#282a36",
--   fg = "#f8f8f2",
--   section_bg = "#38393f",
--   yellow = "#f1fa8c",
--   cyan = "#8be9fd",
--   green = "#50fa7b",
--   orange = "#ffb86c",
--   magenta = "#ff79c6",
--   blue = "#8be9fd",
--   red = "#ff5555",
-- }

-- -- Local helper functions
-- local mode_color = function()
--   local mode_colors = {
--     n = colors.cyan,
--     i = colors.green,
--     c = colors.orange,
--     V = colors.magenta,
--     [""] = colors.magenta,
--     v = colors.magenta,
--     R = colors.red,
--   }

--   local color = mode_colors[vim.fn.mode()]

--   if color == nil then
--     color = colors.red
--   end

--   return color
-- end

-- -- Left side
-- gls.left[1] = {
--   ViMode = {
--     provider = function()
--       local alias = {
--         n = "NORMAL",
--         i = "INSERT",
--         c = "COMMAND",
--         V = "VISUAL",
--         [""] = "VISUAL",
--         v = "VISUAL",
--         R = "REPLACE",
--       }
--       vim.api.nvim_command("hi GalaxyViMode guibg=" .. mode_color())
--       local alias_mode = alias[vim.fn.mode()]
--       if alias_mode == nil then
--         alias_mode = vim.fn.mode()
--       end
--       return "  " .. alias_mode .. " "
--     end,
--     highlight = { colors.bg, colors.bg },
--     separator = " ",
--     separator_highlight = { colors.section_bg, colors.section_bg },
--   },
-- }
-- gls.left[2] = {
--   FileIcon = {
--     provider = "FileIcon",
--     highlight = {
--       require("galaxyline.providers.fileinfo").get_file_icon_color,
--       colors.section_bg,
--     },
--   },
-- }
-- gls.left[3] = {
--   FileName = {
--     provider = "FileName",
--     highlight = { colors.fg, colors.section_bg },
--     separator = " ",
--     separator_highlight = { colors.section_bg, colors.bg },
--   },
-- }
-- gls.left[4] = {
--   GitIcon = {
--     provider = function()
--       return "  "
--     end,
--     condition = condition.check_git_workspace,
--     highlight = { colors.red, colors.bg },
--   },
-- }
-- gls.left[5] = {
--   GitBranch = {
--     provider = function()
--       local vcs = require("galaxyline.providers.vcs")
--       local branch_name = vcs.get_git_branch()
--       if string.len(branch_name) > 28 then
--         return string.sub(branch_name, 1, 25) .. "..."
--       end
--       return branch_name .. " "
--     end,
--     condition = condition.check_git_workspace,
--     highlight = { colors.fg, colors.bg },
--   },
-- }
-- gls.left[6] = {
--   DiffAdd = {
--     provider = "DiffAdd",
--     condition = condition.check_git_workspace,
--     icon = " ",
--     highlight = { colors.green, colors.bg },
--   },
-- }
-- gls.left[7] = {
--   DiffModified = {
--     provider = "DiffModified",
--     condition = condition.check_git_workspace,
--     icon = " ",
--     highlight = { colors.orange, colors.bg },
--   },
-- }
-- gls.left[8] = {
--   DiffRemove = {
--     provider = "DiffRemove",
--     condition = condition.check_git_workspace,
--     icon = " ",
--     highlight = { colors.red, colors.bg },
--   },
-- }
-- gls.left[9] = {
--   LeftEnd = {
--     provider = function()
--       return ""
--     end,
--     highlight = { colors.section_bg, colors.bg },
--   },
-- }
-- gls.left[10] = {
--   Space = {
--     provider = function()
--       return "  "
--     end,
--     highlight = { colors.section_bg, colors.section_bg },
--   },
-- }
-- gls.left[11] = {
--   DiagnosticError = {
--     provider = "DiagnosticError",
--     icon = "  ",
--     highlight = { colors.red, colors.section_bg },
--   },
-- }
-- gls.left[12] = {
--   Space = {
--     provider = function()
--       return " "
--     end,
--     highlight = { colors.section_bg, colors.section_bg },
--   },
-- }
-- gls.left[13] = {
--   DiagnosticWarn = {
--     provider = "DiagnosticWarn",
--     icon = "  ",
--     highlight = { colors.orange, colors.section_bg },
--   },
-- }
-- gls.left[14] = {
--   DiagnosticHint = {
--     provider = "DiagnosticHint",
--     icon = "  ",
--     highlight = { colors.fg, colors.section_bg },
--   },
-- }
-- gls.left[15] = {
--   Space = {
--     provider = function()
--       return " "
--     end,
--     highlight = { colors.section_bg, colors.section_bg },
--   },
-- }
-- gls.left[16] = {
--   DiagnosticInfo = {
--     provider = "DiagnosticInfo",
--     icon = "  ",
--     highlight = { colors.blue, colors.section_bg },
--     separator = " ",
--     separator_highlight = { colors.section_bg, colors.bg },
--   },
-- }
-- -- gls.left[17] = {
-- --   LspProgress = {
-- --     provider = function()
-- --       return require('lsp-progress').progress()
-- --     end,
-- --     event = "LspProgressStatusUpdated",
-- --     highlight = { colors.blue, colors.section_bg },
-- --     separator = " ",
-- --     separator_highlight = { colors.section_bg, colors.bg },
-- --   },
-- -- }
-- -- gls.left[17] = {
-- -- 	NvimGPS = {
-- -- 		provider = function()
-- -- 			return gps.get_location()
-- -- 		end,
-- -- 		condition = function()
-- -- 			return gps.is_available()
-- -- 		end,
-- -- 		icon = "  ",
-- -- 		highlight = { colors.orange, colors.section_bg },
-- -- 	},
-- -- }

-- -- Right side
-- gls.right[1] = {
--   FileFormat = {
--     provider = function()
--       return vim.bo.filetype
--     end,
--     icon = "  ",
--     highlight = { colors.fg, colors.section_bg },
--     separator = "",
--     separator_highlight = { colors.section_bg, colors.bg },
--   },
-- }
-- gls.right[2] = {
--   Spaces = {
--     provider = function()
--       return "  "
--     end,
--     highlight = { colors.section_bg, colors.section_bg },
--   },
-- }
-- gls.right[3] = {
--   PerCent = {
--     provider = "ScrollBar",
--     highlight = { colors.cyan, colors.darkblue, "bold" },
--   },
-- }

-- -- Short status line
-- gls.short_line_left[1] = {
--   BufferType = {
--     provider = "FileTypeName",
--     highlight = { colors.fg, colors.section_bg },
--     separator = "",
--     separator_highlight = { colors.section_bg, colors.bg },
--   },
-- }

-- gls.short_line_right[1] = {
--   BufferIcon = {
--     provider = "BufferIcon",
--     highlight = { colors.yellow, colors.section_bg },
--     separator = " ",
--     separator_highlight = { colors.section_bg, colors.bg },
--   },
-- }

-- Force manual load so that nvim boots with a status line
-- gl.load_galaxyline()
