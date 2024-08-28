local _, lspconfig = pcall(require, "lspconfig")

return {
  root_dir = lspconfig.util.root_pattern({ "tailwind.config.js", "tailwind.config.ts" }),
  cmd = { "tailwindcss-language-server", "--stdio" },
  settings = {
    tailwindCSS = {
      experimental = {
        classRegex = {
          {
            "clsx\\(([^)]*)\\)",
            "(?:'|\"|`)([^']*)(?:'|\"|`)",
          },
          {
            "cva\\(([^)]*)\\)",
            "(?:'|\"|`)([^']*)(?:'|\"|`)", --[[ "[\"'`]([^\"'`]*).*?[\"'`]"  ]]
          },
          {
            "cn\\(([^)]*)\\)",
            "(?:'|\"|`)([^']*)(?:'|\"|`)", --[[ "[\"'`]([^\"'`]*).*?[\"'`]"  ]]
          },
        },
      },
    },
  },
}
