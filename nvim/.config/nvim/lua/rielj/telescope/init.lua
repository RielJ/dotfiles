local builtin = require "telescope.builtin"
local action_state = require "telescope.actions.state"
local themes = require "telescope.themes"

local M = {}

-- another file string search
function M.find_string()
  local opts = {
    border = true,
    previewer = false,
    shorten_path = false,
    layout_strategy = "flex",
    layout_config = {
      width = 0.9,
      height = 0.8,
      horizontal = { width = { padding = 0.15 } },
      vertical = { preview_height = 0.75 },
    },
    file_ignore_patterns = {
      "vendor/*",
      ".git",
      "node_modules",
      "%.jpg",
      "%.jpeg",
      "%.png",
      "%.svg",
      "%.otf",
      "%.ttf",
      "*lock.json",
      "%.lock",
    },
  }
  builtin.live_grep(opts)
end

function M.oldfiles()
  require("telescope").extensions.frecency.frecency(themes.get_ivy {})
end

-- fince file browser using telescope instead of lir
function M.file_browser()
  local opts

  opts = {
    sorting_strategy = "ascending",
    scroll_strategy = "cycle",
    layout_config = {
      prompt_position = "top",
    },
    file_ignore_patterns = {
      "vendor/*",
      "node_modules",
      "%.jpg",
      "%.jpeg",
      "%.png",
      "%.svg",
      "%.otf",
      "%.ttf",
      "*lock.json",
      "%.lock",
    },
    attach_mappings = function(prompt_bufnr, map)
      local current_picker = action_state.get_current_picker(prompt_bufnr)

      local modify_cwd = function(new_cwd)
        current_picker.cwd = new_cwd
        current_picker:refresh(opts.new_finder(new_cwd), { reset_prompt = true })
      end

      map("i", "-", function()
        modify_cwd(current_picker.cwd .. "/..")
      end)

      map("i", "~", function()
        modify_cwd(vim.fn.expand "~")
      end)

      local modify_depth = function(mod)
        return function()
          opts.depth = opts.depth + mod

          local this_picker = action_state.get_current_picker(prompt_bufnr)
          this_picker:refresh(opts.new_finder(current_picker.cwd), { reset_prompt = true })
        end
      end

      map("i", "<M-=>", modify_depth(1))
      map("i", "<M-+>", modify_depth(-1))

      map("n", "yy", function()
        local entry = action_state.get_selected_entry()
        vim.fn.setreg("+", entry.value)
      end)

      return true
    end,
  }

  require("telescope").extensions.file_browser.file_browser(opts)
end

function M.code_actions()
  local opts = {
    layout_config = {
      prompt_position = "top",
      width = 80,
      height = 12,
    },
    borderchars = {
      prompt = { "─", "│", " ", "│", "╭", "╮", "│", "│" },
      results = { "─", "│", "─", "│", "├", "┤", "╯", "╰" },
      preview = { "─", "│", "─", "│", "╭", "╮", "╯", "╰" },
    },
    border = {},
    previewer = false,
    shorten_path = false,
  }
  builtin.lsp_code_actions(themes.get_dropdown(opts))
end

-- show refrences to this using language server
function M.lsp_references()
  local opts = {
    layout_strategy = "vertical",
    layout_config = {
      prompt_position = "top",
    },
    sorting_strategy = "ascending",
    ignore_filename = false,
  }
  builtin.lsp_references(opts)
end

-- show implementations of the current thingy using language server
function M.lsp_implementations()
  local opts = {
    layout_strategy = "vertical",
    layout_config = {
      prompt_position = "top",
    },
    sorting_strategy = "ascending",
    ignore_filename = false,
  }
  builtin.lsp_implementations(opts)
end

-- find files in the upper directory
function M.find_updir()
  local up_dir = vim.fn.getcwd():gsub("(.*)/.*$", "%1")
  local opts = {
    cwd = up_dir,
    file_ignore_patterns = {
      "vendor/*",
      "node_modules",
      "%.jpg",
      "%.jpeg",
      "%.png",
      "%.svg",
      "%.otf",
      "%.ttf",
      "*lock.json",
      "%.lock",
    },
  }

  builtin.find_files(opts)
end

return M
