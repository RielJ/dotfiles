require("tokyonight").setup({
  -- your configuration comes here
  -- or leave it empty to use the default settings
  style = "night", -- The theme comes in three styles, `storm`, `moon`, a darker variant `night` and `day`
  transparent = true, -- Enable this to disable setting the background color
  terminal_colors = true, -- Configure the colors used when opening a `:terminal` in Neovim
  styles = {
    -- Style to be applied to different syntax groups
    -- Value is any valid attr-list value for `:help nvim_set_hl`
    comments = { italic = true },
    keywords = { italic = true },
    functions = {},
    variables = {},
    -- Background styles. Can be "dark", "transparent" or "normal"
    sidebars = "transparent", -- style for sidebars, see below
    floats = "transparent", -- style for floating windows
  },
  sidebars = { "qf", "help" }, -- Set a darker background on sidebar-like windows. For example: `["qf", "vista_kind", "terminal", "packer"]`
  hide_inactive_statusline = false, -- Enabling this option, will hide inactive statuslines and replace them with a thin border instead. Should work with the standard **StatusLine** and **LuaLine**.
  dim_inactive = false, -- dims inactive windows
  lualine_bold = false, -- When `true`, section headers in the lualine theme will be bold
  on_colors = function(colors)
    colors = vim.tbl_extend("force", colors, require("rielj.theme").colors.rose_pine_colors)
  end,
})

require("colorizer").setup({ "*" }, {
  RGB = true, -- #RGB hex codes
  RRGGBB = true, -- #RRGGBB hex codes
  RRGGBBAA = true, -- #RRGGBBAA hex codes
  rgb_fn = true, -- CSS rgb() and rgba() functions
  hsl_fn = true, -- CSS hsl() and hsla() functions
  css = true, -- Enable all CSS features: rgb_fn, hsl_fn, names, RGB, RRGGBB
  css_fn = true, -- Enable all CSS *functions*: rgb_fn, hsl_fn
})

require("rielj.theme").tokyonight()

local colorscheme = "tokyonight-night"

local status_ok, _ = pcall(vim.cmd, "colorscheme " .. colorscheme)
if not status_ok then
  vim.notify("colorscheme " .. colorscheme .. " not found!")
  return
end
