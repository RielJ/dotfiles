---@diagnostic disable: undefined-global
return -- Snippets
{
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
}
