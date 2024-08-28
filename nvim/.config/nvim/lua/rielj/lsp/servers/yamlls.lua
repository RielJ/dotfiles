return {
  enable = true,
  settings = {
    completion = true,
    hover = true,
    yaml = {
      schemaStore = {
        -- You must disable built-in schemaStore support if you want to use
        -- this plugin and its advanced options like `ignore`.
        enable = false,
        -- Avoid TypeError: Cannot read properties of undefined (reading 'length')
        url = "",
      },
      schemas = require("schemastore").yaml.schemas(),
      -- schemas = {
      --   kubernetes = "*.yaml",
      --   ["http://json.schemastore.org/github-workflow"] = ".github/workflows/*",
      --   ["http://json.schemastore.org/github-action"] = ".github/action.{yml,yaml}",
      --   ["https://raw.githubusercontent.com/microsoft/azure-pipelines-vscode/master/service-schema.json"] =
      --   "azure-pipelines.{yml,yaml}",
      --   ["https://raw.githubusercontent.com/ansible/ansible-lint/main/src/ansiblelint/schemas/ansible.json#/$defs/tasks"] =
      --   "roles/tasks/*.{yml,yaml}",
      --   ["https://raw.githubusercontent.com/ansible/ansible-lint/main/src/ansiblelint/schemas/ansible.json#/$defs/playbook"] =
      --   "*play*.{yml,yaml}",
      --   ["http://json.schemastore.org/prettierrc"] = ".prettierrc.{yml,yaml}",
      --   ["http://json.schemastore.org/kustomization"] = "kustomization.{yml,yaml}",
      --   ["http://json.schemastore.org/chart"] = "Chart.{yml,yaml}",
      --   ["https://json.schemastore.org/dependabot-v2"] = ".github/dependabot.{yml,yaml}",
      --   ["https://gitlab.com/gitlab-org/gitlab/-/raw/master/app/assets/javascripts/editor/schema/ci.json"] =
      --   "*gitlab-ci*.{yml,yaml}",
      --   ["https://raw.githubusercontent.com/OAI/OpenAPI-Specification/main/schemas/v3.1/schema.json"] =
      --   "*api*.{yml,yaml}",
      --   ["https://raw.githubusercontent.com/compose-spec/compose-spec/master/schema/compose-spec.json"] =
      --   "*docker-compose*.{yml,yaml}",
      --   ["https://raw.githubusercontent.com/argoproj/argo-workflows/master/api/jsonschema/schema.json"] =
      --   "*flow*.{yml,yaml}",
      -- },
    }
  },
}
