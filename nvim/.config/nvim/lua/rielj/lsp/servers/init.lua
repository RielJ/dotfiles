-- Servers enabled for this config. `true` means "use the defaults";
-- a table (or a module below) means "these settings".
--
-- Disabled servers are not listed. Their configs used to live in this
-- directory as dead files; recover one with `git log -- lua/rielj/lsp/servers/`.
return {
  bashls = true,
  biome = require("rielj.lsp.servers.biome"),
  cssls = require("rielj.lsp.servers.cssls"),
  gopls = require("rielj.lsp.servers.gopls"),
  jsonls = require("rielj.lsp.servers.jsonls"),
  lua_ls = true,
  oxlint = require("rielj.lsp.servers.oxlint"),
  rust_analyzer = require("rielj.lsp.servers.rust_analyzer"),
  tailwindcss = require("rielj.lsp.servers.tailwindcss"),
  tsgo = require("rielj.lsp.servers.tsgo"),
  ty = require("rielj.lsp.servers.ty"),
  yamlls = require("rielj.lsp.servers.yamlls"),
}
