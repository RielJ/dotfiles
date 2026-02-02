return {
  settings = {
    intelephense = {
      files = {
        maxSize = 5000000,
      },
      completion = {
        insertUseDeclaration = true,
        fullyQualifyGlobalConstantsAndFunctions = false,
        triggerParameterHints = true,
        maxItems = 100,
      },
      format = {
        enable = true,
      },
      environment = {
        phpVersion = "8.2",
      },
    },
  },
  filetypes = { "php" },
}
