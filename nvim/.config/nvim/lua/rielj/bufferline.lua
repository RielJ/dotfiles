local M = {}

M.close_except_current = function()
  vim.cmd("BufferLineCloseLeft")
  vim.cmd("BufferLineCloseRight")
end

return M
