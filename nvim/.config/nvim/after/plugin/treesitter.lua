-- nvim-treesitter (main branch) configuration.
--
-- The `main` branch removed the legacy modules system
-- (`require("nvim-treesitter.configs").setup{ highlight=..., indent=... }`).
-- Highlighting, folding and indentation are now driven by Neovim's built-in
-- `vim.treesitter`. We start it per-buffer here, honouring the same disable
-- rules the old config used (latex + big files) and the indent exclusions.

local ts = require("nvim-treesitter")

-- Languages where the highlighter should NOT start.
local highlight_disabled = { latex = true }

-- Languages where the treesitter indentexpr should NOT be used.
local indent_disabled = { yaml = true, python = true }

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
    if not lang or not has_parser(lang) then return end
    if is_bigfile(buf) then return end

    if not highlight_disabled[lang] then
      pcall(vim.treesitter.start, buf, lang)
    end

    if not indent_disabled[lang] then
      vim.bo[buf].indentexpr = "v:lua.require'nvim-treesitter'.indentexpr()"
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

_ = ts -- kept for clarity / future use

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
