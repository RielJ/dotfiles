return {
  -- Replaces iamcco/markdown-preview.nvim (unmaintained since 2024-07, npm build step).
  {
    "brianhuster/live-preview.nvim",
    dependencies = { "nvim-telescope/telescope.nvim" },
    cmd = { "LivePreview" },
    ft = { "markdown", "html", "asciidoc", "svg" },
    opts = {},
  },
  {
    "MeanderingProgrammer/render-markdown.nvim",
    dependencies = { "nvim-treesitter/nvim-treesitter", "nvim-tree/nvim-web-devicons" },
    ft = "markdown",
    config = function()
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

        -- LSP hover and signature-help floats are `buftype=nofile` markdown
        -- buffers, so everything above applies to them too -- including the code
        -- block geometry, which is wrong for a float.
        --
        -- Neovim sizes a hover window from the *raw* text, before this plugin
        -- renders anything. The 2-column left pad is then drawn as inline virtual
        -- text, which shifts the real text right without participating in
        -- 'wrap'. A line that exactly filled the window loses its last two
        -- characters off the right edge: `(parameter) done: (result: null) => vo`.
        -- `min_width = 60` in a 40-column float overflows the same way.
        --
        -- Reset the geometry for floats and keep the language line, which is the
        -- part that actually helps there.
        overrides = {
          buftype = {
            nofile = {
              code = {
                left_pad = 0,
                right_pad = 0,
                min_width = 0,
                width = "block",
              },
            },
          },
        },
      })
    end,
  },
}
