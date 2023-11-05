local ls = require("luasnip")

local snippet = ls.s
local f = ls.function_node
local t = ls.text_node
local i = ls.insert_node

local shortcut = function(val)
  if type(val) == "string" then
    return { t({ val }), i(0) }
  end

  if type(val) == "table" then
    for k, v in ipairs(val) do
      if type(v) == "string" then
        val[k] = t({ v })
      end
    end
  end

  return val
end

local function pascal_cased(input)
  local result = input:gsub("[-_](%w)", function(c)
    return c:upper()
  end)

  return result:gsub("^%l", string.upper) -- Convert the first character to uppercase
end

local M = {}

M.get_filename = function(snip, to_pascal_case)
  local result
  if snip == nil or snip.env == nil then
    return ""
  end
  local file_name = snip.env.TM_FILENAME_BASE
  local path_split = vim.split(vim.fn.expand("%"), "/")
  local folder = path_split[#path_split - 1]
  result = file_name
  print(vim.inspect(folder), vim.inspect(file_name))
  if file_name == "index" then
    result = folder
  end

  if to_pascal_case then
    return pascal_cased(result)
  else
    return result
  end
end

M.same = function(index)
  return f(function(args)
    return args[1]
  end, { index })
end

M.make = function(tbl)
  local result = {}
  for k, v in pairs(tbl) do
    table.insert(result, (snippet({ trig = k, desc = v.desc }, shortcut(v))))
  end

  return result
end

return M
