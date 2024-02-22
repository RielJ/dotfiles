require('ts_context_commentstring').setup {
  enable_autocmd = false,
  languages = {
    typescript = "// %s",
    css = "/* %s */",
    scss = "/* %s */",
    html = "<!-- %s -->",
    svelte = "<!-- %s -->",
    vue = "<!-- %s -->",
    json = "",
  },
}
