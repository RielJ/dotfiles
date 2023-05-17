---@diagnostic disable: undefined-global
return {}, {
  s(
    "print",
    fmt(
      [[
      print(vim.inspect({}))
    ]],
      { i(1) }
    )
  ),
}
