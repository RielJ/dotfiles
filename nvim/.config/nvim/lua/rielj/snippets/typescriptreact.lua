---@diagnostic disable: undefined-global
local utils = require("rielj.luasnip")
return {
  s(
    {
      trig = "rfc",
      priority = 2000,
    },
    fmta(
      [[
      import React, { ReactNode } from 'react'

      interface I<fn> {
        <types>
      }

      function <fn>({<typesAuto>}: I<fn>): ReactNode {
        return <<>><content><</>>
      }

      export { <fn> }
    ]],
      {
        fn = utils.get_filename(),
        types = c(1, {
          i(1),
          sn(2, {
            t({
              "children?: ReactNode",
              "\t",
            }),
            i(1),
          }),
        }),
        typesAuto = f(function(args)
          local str = " "
          local params = args[1]
          if #params ~= 0 then
            for _, param_and_value in ipairs(params) do
              local param = string.gsub(vim.split(param_and_value, ":")[1], "%s+", "")
              local ps = vim.split(param_and_value, ":")
              if #ps == 2 then
                if param:sub(-1) ~= "?" and param ~= "" then
                  str = str .. param .. ", "
                end
              end
            end
            return str:sub(1, -3) .. " "
          end
          return ""
        end, { 1 }),
        content = i(2),
      },
      {
        repeat_duplicates = true,
      }
    )
  ),
}
