---checks if the character preceding the cursor is a space character
---@return boolean true if it is a space character, false otherwise
local check_backspace = function()
  local col = vim.fn.col(".") - 1
  return col == 0 or vim.fn.getline("."):sub(col, col):match("%s")
end

local has_words_before = function()
  unpack = unpack or table.unpack
  local line, col = unpack(vim.api.nvim_win_get_cursor(0))
  return col ~= 0 and vim.api.nvim_buf_get_lines(0, line - 1, line, true)[1]:sub(col, col):match("%s") == nil
end

local luasnip = require("luasnip")
local cmp_autopairs = require("nvim-autopairs.completion.cmp")
local cmp = require("cmp")

vim.api.nvim_set_hl(0, "GhostText", { fg = "#777777", bg = "#333333" })

cmp.setup({
  -- enabled = true,
  -- matching = {},
  -- preselect =cmp.Preselect,
  -- confirmation = {
  --   default_behavior = cmp.ConfirmBehavior.Replace,
  -- },
  -- revision = 1,
  -- performance = {
  --   async_budget = 1000,
  -- },
  view = {
    entries = { name = "custom", selection_order = "near_cursor" },
  },
  enabled = function()
    -- disable completion in comments
    local context = require("cmp.config.context")
    -- keep command mode completion enabled when cursor is in a comment
    if vim.bo.buftype == 'prompt' or (vim.fn.reg_recording() ~= '') or (vim.fn.reg_executing() ~= '') then
      return false
    end
    if vim.api.nvim_get_mode().mode == "c" then
      return true
    else
      return not context.in_treesitter_capture("comment") and not context.in_syntax_group("Comment")
    end
  end,
  confirm = {
    behavior = cmp.ConfirmBehavior.Replace,
    select = true,
  },
  completion = {
    ---@usage The minimum length of a word to complete on.
    keyword_length = 1,
  },
  experimental = {
    ghost_text = {
      hl_group = "GhostText",
    },
  },
  sorting = {
    -- TODO: Would be cool to add stuff like "See variable names before method names" in rust, or something like that.
    comparators = {
      cmp.config.compare.offset,
      cmp.config.compare.exact,
      cmp.config.compare.score,

      -- copied from cmp-under, but I don't think I need the plugin for this.
      -- I might add some more of my own.
      function(entry1, entry2)
        local _, entry1_under = entry1.completion_item.label:find("^_+")
        local _, entry2_under = entry2.completion_item.label:find("^_+")
        entry1_under = entry1_under or 0
        entry2_under = entry2_under or 0
        if entry1_under > entry2_under then
          return false
        elseif entry1_under < entry2_under then
          return true
        end
      end,

      cmp.config.compare.kind,
      cmp.config.compare.sort_text,
      cmp.config.compare.length,
      cmp.config.compare.order,
    },
  },
  formatting = {
    format = function(entry, vim_item)
      local kind_icons = {
        Class = " ",
        Color = " ",
        Constant = "ﲀ ",
        Constructor = " ",
        Enum = "練",
        EnumMember = " ",
        Event = " ",
        Field = " ",
        File = "",
        Folder = " ",
        Function = " ",
        Interface = "ﰮ ",
        Keyword = " ",
        Method = " ",
        Module = " ",
        Operator = "",
        Property = " ",
        Reference = " ",
        Snippet = " ",
        Struct = " ",
        Text = " ",
        TypeParameter = " ",
        Unit = "塞",
        Value = " ",
        Variable = " ",
      }
      local source_names = {
        nvim_lsp = "[LSP]",
        emoji = "[Emoji]",
        path = "[Path]",
        calc = "[Calc]",
        cmp_tabnine = "[Tabnine]",
        luasnip = "[Snippet]",
        buffer = "[Buffer]",
      }
      local duplicates = {
        buffer = 1,
        path = 1,
        nvim_lsp = nil,
        luasnip = 1,
      }
      local duplicates_default = nil
      vim_item.kind = kind_icons[vim_item.kind]
      vim_item.menu = source_names[entry.source.name]
      vim_item.dup = duplicates[entry.source.name] or duplicates_default
      return vim_item
    end,
  },
  snippet = {
    expand = function(args)
      require("luasnip").lsp_expand(args.body)
    end,
  },
  window = {
    documentation = {
      border = { "╭", "─", "╮", "│", "╯", "─", "╰", "│" },
    },
  },
  sources = {
    { name = "nvim_lsp" },
    { name = "path" },
    { name = "cmp_tabnine" },
    { name = "luasnip" },
    { name = "nvim_lua" },
    { name = "buffer" },
    { name = "calc" },
    { name = "emoji" },
    { name = "treesitter" },
    { name = "crates" },
  },
  mapping = cmp.mapping.preset.insert({
    ["<C-d>"] = cmp.mapping.scroll_docs(-4),
    ["<C-f>"] = cmp.mapping.scroll_docs(4),
    -- TODO: potentially fix emmet nonsense
    -- ["<C-j>"] = cmp.mapping(function(fallback)
    --   if luasnip.expand_or_jumpable() then
    --     luasnip.expand_or_jump()
    --   end
    -- end, {
    --   "i",
    --   "s",
    -- }),
    ["<C-l"] = cmp.mapping(function()
      if luasnip.choice_active() then
        luasnip.chane_choice(1)
      end
    end, {
      "i",
    }),
    ["<Tab>"] = cmp.mapping(function(fallback)
      if cmp.visible() then
        cmp.select_next_item()
      elseif luasnip.expand_or_jumpable() then
        luasnip.expand_or_locally_jumpable()
      elseif has_words_before() then
        cmp.complete()
      elseif check_backspace() then
        fallback()
        -- elseif is_emmet_active() then
        --   return vim.fn["cmp#complete"]()
      else
        fallback()
      end
    end, {
      "i",
      "s",
    }),
    ["<S-Tab>"] = cmp.mapping(function(fallback)
      if cmp.visible() then
        cmp.select_prev_item()
      elseif luasnip.jumpable(-1) then
        luasnip.jump(-1)
      else
        fallback()
      end
    end, {
      "i",
      "s",
    }),
    ["<C-Space>"] = cmp.mapping.complete(),
    -- ["<C-Space>"] = cmp.mapping(function()
    --   if cmp.visible() then
    --     cmp.confirm({
    --       behavior = cmp.ConfirmBehavior.Replace,
    --       select = true,
    --     })
    --   else
    --     cmp.complete()
    --   end
    -- end),
    ["<C-e>"] = cmp.mapping({
      i = cmp.mapping.abort(),
      c = cmp.mapping.close(),
    }),
    ["<CR>"] = cmp.mapping({
      i = function(fallback)
        if cmp.visible() and cmp.get_active_entry() then
          cmp.confirm({
            behavior = cmp.ConfirmBehavior.Replace,
            select = true,
          })
        else
          fallback()
        end
      end,
      s = cmp.mapping.confirm({ select = true }),
      c = cmp.mapping.confirm({ behavior = cmp.ConfirmBehavior.Replace, select = true }),
    }),
  }),
})
cmp.event:on("confirm_done", cmp_autopairs.on_confirm_done())
-- require("cmp_tabnine").setup({
--   max_lines = 1000,
--   max_num_results = 10,
--   sort = true,
-- })
local tabnine = require("cmp_tabnine.config")

tabnine:setup({
  max_lines = 1000,
  max_num_results = 20,
  sort = true,
  run_on_every_keystroke = true,
  snippet_placeholder = "..",
  ignored_file_types = {
    -- default is not to ignore
    -- uncomment to ignore in lua:
    -- lua = true
  },
  show_prediction_strength = false,
})
