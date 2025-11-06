return {
  settings = {
    gopls = {
      codelenses = { test = true },
      hints = {
        assignVariableTypes = true,
        compositeLiteralFields = true,
        compositeLiteralTypes = true,
        constantValues = true,
        functionTypeParameters = true,
        parameterNames = true,
        rangeVariableTypes = true,
      },
    },
  },

  flags = {
    debounce_text_changes = 200,
  },
  filetypes = { "go", "gomod", "gowork", "gotmpl" },
}
