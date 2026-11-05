-- The LeetCode solutions workspace. leetcode.nvim stores problems here, and
-- AI completion stays off inside it so solving a problem gets no hints.
local M = {}

M.home = vim.fn.expand("~/personal/projects/leetcode-patterns")

--- True when `path` is the workspace itself or anything inside it.
---@param path string
---@return boolean
function M.contains(path)
  if path == "" then
    return false
  end
  local resolved = vim.fs.normalize(vim.fn.fnamemodify(path, ":p")):gsub("/$", "")
  return resolved == M.home or vim.startswith(resolved, M.home .. "/")
end

return M
