local ls = require("luasnip")
local types = require("luasnip.util.types")

ls.setup({
  history = false,                           --keep around last snippet local to jump back
  updateevents = "TextChanged,TextChangedI", --update changes as you type
  enable_autosnippets = true,
  snip_env = {
    filename = function()
      table.insert(
        getfenv(2).ls_file_snippets,
        ls.f(function(_, snip)
          return snip.env.TM_FILENAME_BASE or ""
        end)
      )
    end,
  },
  ext_opts = {
    [types.choiceNode] = {
      active = {
        virt_text = { { " « ", "NonTest" } },
      },
    },
    snippet_passive = {},
  },
})

-- <c-k> is my expansion key
-- this will expand the current item or jump to the next item within the snippet.
vim.keymap.set({ "i", "s" }, "<c-l>", function()
  if ls.expand_or_jumpable() and ls.in_snippet() then
    ls.expand_or_jump()
  end
end, { silent = true })

-- <c-j> is my jump backwards key.
-- this always moves to the previous item within the snippet
vim.keymap.set({ "i", "s" }, "<c-h>", function()
  if ls.jumpable(-1) and ls.in_snippet() then
    ls.jump(-1)
  end
end, { silent = true })

vim.keymap.set({ "i", "s" }, "<c-j>", function()
  if ls.choice_active() == true and ls.in_snippet() then
    ls.change_choice(-1)
  end
end, { silent = true })
vim.keymap.set({ "i", "s" }, "<c-k>", function()
  if ls.choice_active() == true and ls.in_snippet() then
    ls.change_choice(1)
  end
end, { silent = true })
vim.keymap.set({ "i", "s" }, "<c-u>", function()
  if ls.expand_or_jumpable() then
    ls.expand_or_jump()
  end
end, { silent = true })

vim.keymap.set("n", "<leader><leader>s", "<cmd>source ~/.config/nvim/after/plugin/snippets.lua<CR>")
vim.keymap.set("n", "<leader><leader>c", "<cmd>source ~/.config/nvim/lua/rielj/luasnip.lua<CR>")

-- vim.keymap.set("i", "<c-u>", require "luasnip.extras.select_choice")
-- vim.keymap.set("s", "<c-u>", require "luasnip.extras.select_choice")
-- vim.api.nvim_set_keymap("i", "<C-l>", "<Plug>luasnip-next-choice", {})
-- vim.api.nvim_set_keymap("s", "<C-l>", "<Plug>luasnip-next-choice", {})
-- vim.api.nvim_set_keymap("i", "<C-h>", "<Plug>luasnip-prev-choice", {})
-- vim.api.nvim_set_keymap("s", "<C-h>", "<Plug>luasnip-prev-choice", {})
require("luasnip.loaders.from_vscode").lazy_load()
require("luasnip.loaders.from_lua").lazy_load({
  paths = "~/.config/nvim/lua/rielj/snippets",
  default_priority = 1,
})
--
