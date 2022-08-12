local status_ok, tabnine = pcall(require, "cmp_tabnine")
if not status_ok then
  return
end

local conf = require("cmp_tabnine.config")

conf:setup {
  max_lines = 1000,
  max_num_results = 10,
  sort = true,
}
