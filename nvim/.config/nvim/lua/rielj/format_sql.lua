local M = {}

-- Helper function to check if a range is inside another range
local function is_inside(inner, outer)
  if inner.start_row > outer.start_row and inner.end_row < outer.end_row then
    return true
  end
  if inner.start_row == outer.start_row and inner.start_col > outer.start_col then
    return true
  end
  if inner.end_row == outer.end_row and inner.end_col < outer.end_col then
    return true
  end
  return false
end

-- Step 3: Format SQL in current buffer
function M.format_sql_in_current_buffer()
  local bufnr = vim.api.nvim_get_current_buf()
  local parser = vim.treesitter.get_parser(bufnr, "typescript")
  local tree = parser:parse()[1]
  local root = tree:root()

  local query = vim.treesitter.query.parse(
    "typescript",
    [[
        (call_expression
          function: [
            (identifier) @_name
            (await_expression (identifier) @_name)
            (instantiation_expression function: (identifier) @_name)
            (non_null_expression
              (instantiation_expression
                (await_expression
                  (identifier) @_name)))
          ]
          arguments: (template_string) @injection.content
          (#any-of? @_name "sql" "tx" "sqlClient"))
  ]]
  )

  local mason_bin = vim.fn.stdpath("data") .. "/mason/bin/sql-formatter"

  -- If mason_bin does not exist or isn't executable, fall back to using npx sql-formatter
  local formatter_command = {}
  if vim.fn.filereadable(mason_bin) and vim.fn.executable(mason_bin) == 1 then
    formatter_command = { mason_bin, "--language", "postgresql" }
  else
    formatter_command = { "pnpx", "sql-formatter", "--language", "postgresql" }
  end

  -- Collect all targets
  local all_targets = {}
  for id, node in query:iter_captures(root, bufnr, 0, -1) do
    if query.captures[id] == "injection.content" then
      local start_row, start_col, end_row, end_col = node:range()
      table.insert(all_targets, {
        start_row = start_row,
        start_col = start_col,
        end_row = end_row,
        end_col = end_col,
      })
    end
  end

  -- Filter out nested targets (only keep top-level ones)
  local targets = {}
  for _, target in ipairs(all_targets) do
    local is_nested = false
    for _, other in ipairs(all_targets) do
      if target ~= other and is_inside(target, other) then
        is_nested = true
        break
      end
    end
    if not is_nested then
      table.insert(targets, target)
    end
  end

  if #targets == 0 then
    vim.notify("No SQL template strings found", vim.log.levels.INFO)
    return
  end

  local replacements = {}

  for _, t in ipairs(targets) do
    local lines = vim.api.nvim_buf_get_text(bufnr, t.start_row, t.start_col, t.end_row, t.end_col, {})
    local sql_text = table.concat(lines, "\n")

    -- Strip out backticks for formatting (if present)
    sql_text = sql_text:gsub("^%s*`", ""):gsub("`%s*$", "")

    -- Replace template interpolations with placeholders (handle nested templates)
    local replaced = {}
    local placeholder_count = 0
    local function replace_interpolations(text)
      local result = ""
      local i = 1

      while i <= #text do
        -- Look for ${
        if text:sub(i, i + 1) == "${" then
          -- Found start of interpolation
          local brace_depth = 1
          local j = i + 2
          local in_string = false
          local string_char = nil
          local in_template = false

          -- Find the matching closing brace
          while j <= #text and brace_depth > 0 do
            local char = text:sub(j, j)
            local prev_char = j > 1 and text:sub(j - 1, j - 1) or ""

            -- Check if we're entering/exiting a string
            if not in_template and (char == '"' or char == "'") and prev_char ~= "\\" then
              if in_string and char == string_char then
                in_string = false
                string_char = nil
              elseif not in_string then
                in_string = true
                string_char = char
              end
            -- Check for template literals (backticks)
            elseif char == "`" and prev_char ~= "\\" then
              in_template = not in_template
            -- Only count braces outside of strings and templates
            elseif not in_string and not in_template then
              if char == "{" then
                brace_depth = brace_depth + 1
              elseif char == "}" then
                brace_depth = brace_depth - 1
              end
            end

            j = j + 1
          end

          if brace_depth == 0 then
            -- Successfully found matching brace
            local expr = text:sub(i + 2, j - 2)
            placeholder_count = placeholder_count + 1
            table.insert(replaced, expr)
            result = result .. "___PLACEHOLDER_" .. placeholder_count .. "___"
            i = j
          else
            -- No matching brace, treat as literal
            result = result .. text:sub(i, i)
            i = i + 1
          end
        else
          result = result .. text:sub(i, i)
          i = i + 1
        end
      end

      return result
    end

    sql_text = replace_interpolations(sql_text)

    -- Format SQL (with the outer templates replaced)
    -- local formatted = vim.fn.system({ formatter_command, "--language", "postgresql" }, sql_text)
    local formatted = vim.fn.system(formatter_command, sql_text)

    if vim.v.shell_error ~= 0 or formatted:match("Parse error") then
      vim.notify("SQL formatter parse error:\n" .. formatted, vim.log.levels.ERROR)
      goto continue
    end

    -- Restore placeholders
    for idx, expr in ipairs(replaced) do
      formatted = formatted:gsub("___PLACEHOLDER_" .. idx .. "___", "${" .. expr .. "}")
    end

    formatted = formatted:gsub("\n+$", "")

    -- Determine indentation
    local prefix_line = vim.api.nvim_buf_get_lines(bufnr, t.start_row, t.start_row + 1, false)[1] or ""
    local base_indent = prefix_line:match("^(%s*)") or ""
    local sw = vim.bo.shiftwidth > 0 and string.rep(" ", vim.bo.shiftwidth) or "  "

    -- Re-indent formatted SQL (1 indent level inside)
    local indented = {}
    for line in formatted:gmatch("[^\n]+") do
      table.insert(indented, base_indent .. sw .. line)
    end

    -- Wrap cleanly with backticks, no redundant blank lines
    local final = "`\n" .. table.concat(indented, "\n") .. "\n" .. base_indent .. "`"

    table.insert(replacements, {
      range = t,
      new_text = vim.split(final, "\n"),
    })

    ::continue::
  end

  -- Sort replacements in reverse order (bottom to top) to avoid offset issues
  table.sort(replacements, function(a, b)
    return a.range.start_row > b.range.start_row
  end)

  for _, r in ipairs(replacements) do
    vim.api.nvim_buf_set_text(bufnr, r.range.start_row, r.range.start_col, r.range.end_row, r.range.end_col, r.new_text)
  end

  vim.notify("Formatted " .. #replacements .. " SQL template string(s)", vim.log.levels.INFO)
end

return M
