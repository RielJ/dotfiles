require("render-markdown").setup({
  completions = { lsp = { enabled = true } },

  -- Headings: distinct nerd-font icons + colored backgrounds per level
  heading = {
    enabled = true,
    sign = false,
    icons = { "󰲡 ", "󰲣 ", "󰲥 ", "󰲧 ", "󰲩 ", "󰲫 " },
    backgrounds = {
      "RenderMarkdownH1Bg",
      "RenderMarkdownH2Bg",
      "RenderMarkdownH3Bg",
      "RenderMarkdownH4Bg",
      "RenderMarkdownH5Bg",
      "RenderMarkdownH6Bg",
    },
    foregrounds = {
      "RenderMarkdownH1",
      "RenderMarkdownH2",
      "RenderMarkdownH3",
      "RenderMarkdownH4",
      "RenderMarkdownH5",
      "RenderMarkdownH6",
    },
    width = "full",
  },

  -- Code blocks: full style with language icon + colored border
  code = {
    enabled = true,
    sign = false,
    style = "full",
    left_pad = 2,
    right_pad = 2,
    border = "thin",
    language_pad = 1,
    language_name = true,
    width = "full",
    min_width = 60,
  },

  -- Bullet points: tiered icons
  bullet = {
    enabled = true,
    icons = { "●", "○", "◆", "◇" },
  },

  -- Checkboxes: clear visual distinction
  checkbox = {
    enabled = true,
    unchecked = { icon = "󰄱 ", highlight = "RenderMarkdownUnchecked" },
    checked = { icon = "󰱒 ", highlight = "RenderMarkdownChecked" },
    custom = {
      todo = { raw = "[-]", rendered = "󰥔 ", highlight = "RenderMarkdownTodo" },
    },
  },

  -- Block quotes: thicker bar
  quote = { enabled = true, icon = "▎", repeat_linebreak = true },

  -- Tables: full borders with more padding
  pipe_table = {
    enabled = true,
    style = "full",
    cell = "padded",
    min_width = 12,
  },

  -- Links: show icons for different link types
  link = {
    enabled = true,
    hyperlink = "󰌹 ",
    image = "󰥶 ",
    email = "󰀓 ",
    custom = {
      web = { pattern = "^http", icon = "󰖟 " },
      github = { pattern = "github%.com", icon = " " },
    },
  },

  -- Horizontal rules: full-width dashed line
  dash = {
    enabled = true,
    icon = "─",
    width = "full",
  },

  -- Callouts: nerd-font icons
  callout = {
    note = { raw = "[!NOTE]", rendered = "󰋽 Note", highlight = "RenderMarkdownInfo" },
    tip = { raw = "[!TIP]", rendered = "󰌶 Tip", highlight = "RenderMarkdownSuccess" },
    important = { raw = "[!IMPORTANT]", rendered = "󰅾 Important", highlight = "RenderMarkdownHint" },
    warning = { raw = "[!WARNING]", rendered = "󰀪 Warning", highlight = "RenderMarkdownWarn" },
    caution = { raw = "[!CAUTION]", rendered = "󰳦 Caution", highlight = "RenderMarkdownError" },
  },

  -- Conceal: hide raw markdown syntax for cleaner view
  win_options = {
    conceallevel = { rendered = 2 },
    concealcursor = { rendered = "nc" },
  },
})
