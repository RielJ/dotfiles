-- YAML schemas from b0o/schemastore.nvim, plus a Kubernetes entry for
-- `k8s-*.yaml`.
--
-- schemaStore.enable is left ON (the server's own store). Turning it off is
-- only needed when schemastore.nvim's advanced options are used.
---@type vim.lsp.Config
return {
  settings = {
    yaml = {
      schemas = require("schemastore").yaml.schemas({
        extra = {
          {
            description = "kubernetes",
            fileMatch = { "k8s-*.yaml" },
            url = "https://github.com/yannh/kubernetes-json-schema",
            name = "kubernetes",
          },
        },
      }),
    },
  },
}
