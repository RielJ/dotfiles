---@diagnostic disable: undefined-global
local utils = require("rielj.luasnip")
local rep = require("luasnip.extras").rep

return {
  s(
    {
      trig = "tfn",
      dscr = "Typescript Function",
      priority = 1100,
    },
    fmt(
      [[
    {functionType}{functionName}{}({parameters}){returnType}{}{{
      {}
    }}
    ]],
      {
        functionType = c(1, { t("function "), t("const ") }),
        functionName = i(2, "functionName"),
        f(function(args)
          if args[1][1] == "function " then
            return " "
          else
            return " = "
          end
        end, { 1 }),
        parameters = c(3, {
          sn(1, { t("{ "), i(1), t(" }: { "), i(2), t(" }") }),
          t(""),
        }),
        returnType = c(4, {
          sn(1, { t(": "), i(1, "void") }),
          t(""),
        }),
        f(function(args)
          if args[1][1] == "function " then
            return " "
          else
            return " => "
          end
        end, { 1 }),
        i(5),
      }
    )
  ),
  s(
    {
      trig = "ruh",
      priority = 2000,
    },
    fmt(
      [[
      {types}

      export const {fn} = ({typesAuto}) => {{
        return null
      }}
    ]],
      {
        fn = f(function(_, snip)
          return utils.get_filename(snip, true):gsub("^%u", string.lower)
        end),
        types = d(1, function(_, snip)
          local file_name = utils.get_filename(snip, true)
          return sn(
            nil,
            c(1, {
              sn(nil, {
                t({ "", "" }),
                t({ "type " .. file_name .. "Props = {", "\t" }),
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
            return "" .. "{ " .. str:sub(1, -3) .. " }: " .. utils.get_filename(snip, true) .. "Props"
          end
          return ""
        end, { 1 }),
      },
      {
        repeat_duplicates = true,
      }
    )
  ),

  s(
    {
      trig = "tif",
      dscr = "Typescript If Function",
      priority = 1100,
    },
    fmt(
      [[
          if ({}) {{
            {}
          }} {}
          ]],
      {
        i(1, "condition"),
        i(2),
        c(3, {
          i(1),
          sn(2, { t({ "else {", "\t" }), i(1), t({ "", "}" }) }),
          sn(3, { t({ "else if (" }), i(1), t({ ") {", "\t" }), i(2), t({ "", "}" }) }),
        }),
      }
    )
  ),
  s(
    "exc",
    fmt(
      [[
      export const {} = {}
    ]],
      { i(1, "name"), i(2, "value") }
    )
  ),
}, {
  s(
    {
      trig = "for(let i = 0",
      dscr = "Indexed array loop",
      priority = 2000,
      wordTrig = false,
      resolveExpandParams = function(_, line_to_cursor, matched_trigger, captures)
        local row = vim.api.nvim_win_get_cursor(0)[1] - 1
        local col = #line_to_cursor
        local next_char = vim.api.nvim_get_current_line():sub(col + 1, col + 1)

        return {
          trigger = matched_trigger,
          captures = captures,
          clear_region = {
            from = { row, col - #matched_trigger },
            to = { row, col + (next_char == ")" and 1 or 0) },
          },
        }
      end,
    },
    fmt(
      [[
for(let i = 0; i < {array}.length; i++) {{
  const {element} = {array_ref}[i];
  {body}
}}
]],
      {
        array = i(1, "array"),
        element = i(2, "element"),
        array_ref = rep(1),
        body = i(0),
      }
    )
  ),
  s(
    "/**",
    fmt(
      [[
      /**
       * {}
       */
      ]],
      { i(1) }
    )
  ),
}
