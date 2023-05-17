---@diagnostic disable: undefined-global
local utils = require("rielj.luasnip")
return {
  s(
    {
      trig = "trfc",
      priority = 2000,
    },
    fmta(
      [[
      import React from 'react'
      <types>
      function <fn>(<typesAuto>): JSX.Element {
        return <content>
      }

      export { <fn> }
    ]],
      {
        fn = f(function(_, snip)
          return utils.get_filename(snip)
        end),
        types = d(1, function(_, snip)
          local file_name = utils.get_filename(snip)
          return sn(
            nil,
            c(1, {
              sn(nil, {
                t({ "", "" }),
                t({ "interface I" .. file_name .. " {", "\t" }),
                i(1),
                t({ "", "}" }),
                t({ "", "" }),
              }),
              t({ "" }),
            })
          )
        end, {}),
        typesAuto = f(function(args, snip)
          local str = ""
          local params = args[1]
          if #params ~= 1 then
            for _, param_and_value in ipairs(params) do
              local param = string.gsub(vim.split(param_and_value, ":")[1], "%s+", "")
              local ps = vim.split(param_and_value, ":")
              if #ps == 2 then
                if param:sub(-1) ~= "?" and param ~= "" then
                  str = str .. param .. ", "
                end
              end
            end
            return "" .. "{ " .. str:sub(1, -3) .. " }: I" .. utils.get_filename(snip)
          end
          return ""
        end, { 1 }),
        content = c(2, {
          sn(nil, {
            t("<>"),
            i(1),
            t("</>"),
          }),
          sn(nil, {
            t("<div>"),
            i(1),
            t("</div>"),
          }),
        }),
      },
      {
        repeat_duplicates = true,
      }
    )
  ),
}
