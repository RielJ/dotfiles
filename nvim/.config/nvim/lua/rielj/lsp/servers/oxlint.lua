-- oxlint language server (oxc).
-- Uses nvim-lspconfig defaults: attaches only when the project ships an
-- `.oxlintrc.json` (or oxlint config), resolving the local
-- `node_modules/.bin/oxlint`. Coexists with biome — each self-attaches per
-- project via its own root markers. Provides `:LspOxlintFixAll`.
return {}
