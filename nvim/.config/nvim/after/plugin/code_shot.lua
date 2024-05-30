require("code-shot").setup({
  ---@return string output file path
  output = function()
    local core = require("core")
    local buf_name = vim.api.nvim_buf_get_name(0)
    return "~/Pictures/" .. core.file.name(buf_name) .. ".png"
  end,
  ---@return string[]
  -- select_area: {start_line: number, end_line: number} | nil
  options = function(select_area)
    if not select_area then
      return {}
    end
    return {
      "--line-offset",
      select_area.start_line,
      "--theme",
      "DarkNeon",

    }
  end,
})

-- set keymap normal mode
-- vim.api.nvim_set_keymap("n", "<leader>cs", "<cmd>lua require('code-shot').capture()<CR>",
--   { noremap = true, silent = true })

-- set keymap visual mode
vim.api.nvim_set_keymap("v", "<leader>ss", "<cmd>lua require('code-shot').shot()<CR>",
  { noremap = true, silent = true })
