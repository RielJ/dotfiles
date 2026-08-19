-- unknownAtRules = "ignore" keeps Tailwind's @tailwind/@apply/@screen from
-- being flagged as errors in plain CSS files.
---@type vim.lsp.Config
return {
  settings = {
    css = { validate = true, lint = { unknownAtRules = "ignore" } },
    scss = { validate = true, lint = { unknownAtRules = "ignore" } },
    less = { validate = true, lint = { unknownAtRules = "ignore" } },
  },
}
