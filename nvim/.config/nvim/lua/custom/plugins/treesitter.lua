return {
  {
    "nvim-treesitter/nvim-treesitter",
    branch = "main",
    build = ":TSUpdate",
    -- `playground` is archived; Neovim ships `:InspectTree` since 0.9.
    -- `nvim-treesitter-textobjects` targets the legacy `master` modules API.
    -- Re-enable manually once you migrate its keymaps to query-based selection.
    config = function()
      -- nvim-treesitter (main branch) configuration.
      --
      -- The `main` branch removed the legacy modules system
      -- (`require("nvim-treesitter.configs").setup{ highlight=..., indent=... }`).
      -- Highlighting, folding and indentation are now driven by Neovim's built-in
      -- `vim.treesitter`. We start it per-buffer here, honouring the same disable
      -- rules the old config used (latex + big files) and the indent exclusions.

      local ts = require("nvim-treesitter")

      -- The treesitter indent entry point differs by branch, and this checkout
      -- is `master` (archived upstream) despite the `branch = "main"` above --
      -- lazy never switched it, and the locked commit is not even present.
      --
      --   main:   v:lua.require'nvim-treesitter'.indentexpr()
      --   master: nvim_treesitter#indent()          (autoload/nvim_treesitter.vim)
      --
      -- Pointing at main's expr from a master checkout set an 'indentexpr' whose
      -- function does not exist, so every evaluation failed and returned 0: `o`
      -- inside a nested block opened a line at column 1. Detect instead of
      -- assume, so this survives an eventual branch switch either way.
      -- Detection note: `exists("*nvim_treesitter#indent")` is 0 until something
      -- calls it, because Neovim's exists() does not source the autoload script.
      -- Test for the file on the runtimepath instead.
      local indent_expr = nil
      if type(ts.indentexpr) == "function" then
        indent_expr = "v:lua.require'nvim-treesitter'.indentexpr()"
      elseif #vim.api.nvim_get_runtime_file("autoload/nvim_treesitter.vim", false) > 0 then
        indent_expr = "nvim_treesitter#indent()"
      end

      -- Languages where the highlighter should NOT start.
      local highlight_disabled = { latex = true }

      -- Languages where the treesitter indentexpr should NOT be used.
      -- Neovim's runtime indent scripts handle JS/TS more reliably than the
      -- experimental treesitter indenter, including LeetCode scratch buffers.
      local indent_disabled = {
        javascript = true,
        typescript = true,
        tsx = true,
        yaml = true,
        python = true,
      }

      -- Detect buffers flagged as "big file" by whatever bigfile plugin is in use.
      local function is_bigfile(buf)
        local ok, val = pcall(vim.api.nvim_buf_get_var, buf, "bigfile_disable_treesitter")
        return ok and val == true
      end

      -- Resolve a filetype to a treesitter language, if any.
      local function lang_for(ft)
        return vim.treesitter.language.get_lang(ft) or ft
      end

      -- Returns true if a parser is available for the given language.
      local function has_parser(lang)
        return pcall(vim.treesitter.get_string_parser, "", lang)
      end

      local group = vim.api.nvim_create_augroup("NvimTreesitterMain", { clear = true })

      -- Start the highlighter / indentexpr for supported buffers.
      vim.api.nvim_create_autocmd("FileType", {
        group = group,
        callback = function(args)
          local buf = args.buf
          local lang = lang_for(args.match)
          if not lang or not has_parser(lang) then
            return
          end
          if is_bigfile(buf) then
            return
          end

          if not highlight_disabled[lang] then
            pcall(vim.treesitter.start, buf, lang)
          end

          -- With no usable treesitter indent, leave 'indentexpr' alone: the
          -- runtime ftplugin's own indent script is a working fallback, and
          -- clobbering it is what caused the column-1 bug.
          if indent_expr and not indent_disabled[lang] then
            vim.bo[buf].indentexpr = indent_expr
          end
        end,
      })

      -- Auto-install missing parsers (replaces the old `auto_install = true`).
      vim.api.nvim_create_autocmd("FileType", {
        group = group,
        callback = function(args)
          local lang = lang_for(args.match)
          if lang and not has_parser(lang) then
            vim.cmd("silent! TSInstall " .. vim.fn.fnameescape(lang))
          end
        end,
      })

      require("treesitter-context").setup({
        enable = true, -- Enable this plugin (Can be enabled/disabled later via commands)
        max_lines = 1, -- How many lines the window should span. Values <= 0 mean no limit.
        min_window_height = 0, -- Minimum editor window height to enable context. Values <= 0 mean no limit.
        line_numbers = true,
        multiline_threshold = 20, -- Maximum number of lines to show for a single context
        trim_scope = "outer", -- Which context lines to discard if `max_lines` is exceeded. Choices: 'inner', 'outer'
        mode = "cursor", -- Line used to calculate context. Choices: 'cursor', 'topline'
        -- Separator between context and content. Should be a single character string, like '-'.
        -- When separator is set, the context will only show up when there are at least 2 lines above cursorline.
        separator = nil,
        zindex = 20, -- The Z-index of the context window
        on_attach = nil, -- (fun(buf: integer): boolean) return false to disable attaching
      })
    end,
  },
  -- Dependency of the context config above; loaded with it.
  { "nvim-treesitter/nvim-treesitter-context", lazy = true },
  {
    "0oAstro/dim.lua",
    dependencies = { "nvim-treesitter/nvim-treesitter", "neovim/nvim-lspconfig" },
    -- Dims unused symbols from LSP diagnostics, so it has nothing to do until
    -- a server attaches.
    event = "LspAttach",
    opts = {},
  },
}
