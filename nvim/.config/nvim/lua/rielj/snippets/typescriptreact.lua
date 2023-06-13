---@diagnostic disable: undefined-global
local utils = require("rielj.luasnip")
return {
  s({ trig = "uc", priority = 2000 }, { t([['use client']]) }),
  s(
    { trig = "ims", priority = 2000 },
    fmt(
      [[
    import styles from "./{fn}.module.scss"
  ]],
      {
        fn = f(function(_, snip)
          return utils.get_filename(snip)
        end),
      }
    )
  ),
  s(
    { trig = "clms", priority = 2000 },
    fmt(
      [[
    className={{clsx(styles["{}"])}}
  ]],
      {
        i(1),
      }
    )
  ),
  s(
    {
      trig = "nlfc",
      priority = 2000,
    },
    fmt(
      [[
      {types}

      const {fn} = async ({typesAuto}) => {{
        return {content}
      }}

      export default {fn}
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
                t({ "interface I" .. file_name .. " {", "\t", "children: React.ReactNode", "", "\t" }),
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
  s(
    {
      trig = "ncfc",
      priority = 2000,
    },
    fmt(
      [[
      'use client';

      {types}
      const {fn} = ({typesAuto}) => {{
        return {content}
      }}

      export default {fn}
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
  s(
    {
      trig = "nsfc",
      priority = 2000,
    },
    fmt(
      [[
      import React from 'react'
      {types}
      const {fn} = ({typesAuto}) => {{
        return {content}
      }}

      export default {fn}
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
  s(
    {
      trig = "trfc",
      priority = 2000,
    },
    fmt(
      [[
      import React from 'react'
      {types}
      const {fn} = ({typesAuto}) => {{
        return {content}
      }}

      export {{ {fn} }}
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
}, {
  s(
    { trig = "classN", priority = 2000 },
    fmt(
      [[
    className="{}"
  ]],
      {
        i(1),
      }
    )
  ),
}
