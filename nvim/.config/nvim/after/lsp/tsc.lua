-- TypeScript 7 native language server.
--
-- The binary was called `tsgo` during the preview; TypeScript 7.0 ships it as
-- `tsc --lsp --stdio` and nvim-lspconfig's `tsgo` config is now a deprecation
-- shim over `tsc`. Everything below is an *override* of lspconfig's `lsp/tsc.lua`,
-- which already handles binary resolution (project-local `node_modules/.bin`
-- first, `--version` major >= 7 required), monorepo roots and Deno exclusion.
-- Do not add `cmd` here: hardcoding it defeats that resolution.
--
-- Note the settings key. The native server reads VS Code-style `js/ts` keys;
-- the old `typescript.*`/`preferences.*` shape belongs to tsserver-based
-- servers (ts_ls, vtsls) and is ignored here.
---@type vim.lsp.Config
return {
  on_attach = function(client, bufnr)
    -- Formatting is conform's job (oxfmt > biome > prettier).
    client.server_capabilities.documentFormattingProvider = false
    client.server_capabilities.documentRangeFormattingProvider = false

    -- gs, ge, gS, go, gA, gR
    require("rielj.ts-tools").on_attach(bufnr)
  end,
  settings = {
    ["js/ts"] = {
      inlayHints = {
        parameterNames = {
          enabled = "all",
          suppressWhenArgumentMatchesName = true,
        },
        parameterTypes = { enabled = true },
        variableTypes = { enabled = true },
        propertyDeclarationTypes = { enabled = true },
        functionLikeReturnTypes = { enabled = false },
        enumMemberValues = { enabled = true },
      },
      preferences = {
        importModuleSpecifier = "non-relative",
        importModuleSpecifierEnding = "minimal",
        preferTypeOnlyAutoImports = true,
        autoImportFileExcludePatterns = {
          "@radix-ui",
          "react-day-picker",
        },
      },
    },
  },
}
