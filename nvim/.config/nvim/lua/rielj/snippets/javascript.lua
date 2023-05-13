---@diagnostic disable: undefined-global
return -- Snippets
    {
      s(
        {
          trig = "jfnc",
          dscr = "Javascript Method Function",
          priority = 1100,
        },
        fmt(
          [[
    function {functionName} ({parameters}) {{
      {}
    }}
    ]],
          {
            functionName = i(1, "functionName"),
            parameters = i(2, "parameters"),
            i(3),
          }
        )
      ),
      s(
        {
          trig = "jvfnca",
          dscr = "Javascript Variable Arrow Function",
          priority = 1100,
        },
        fmt(
          [[
    const {functionName} = ({parameters}) => {{
      {}
    }}
    ]],
          {
            functionName = i(1, "functionName"),
            parameters = i(2, "parameters"),
            i(3),
          }
        )
      ),
      s(
        {
          trig = "jvfncm",
          dscr = "Javascript Variable Method Function",
          priority = 1100,
        },
        fmt(
          [[
    const {functionName} = ({parameters}) => {{
      {}
    }}
    ]],
          {
            functionName = i(1, "functionName"),
            parameters = i(2, "parameters"),
            i(3),
          }
        )
      ),
    },
    -- AutoSnippets
    {
      s(
        {
          trig = "jFN",
          dscr = "Javascript Variable Method Function",
          priority = 1100,
        },
        fmt(
          [[
    const {functionName} = ({parameters}) => {{
      {}
    }}
    ]],
          {
            functionName = i(1, "functionName"),
            parameters = i(2, "parameters"),
            i(3),
          }
        )
      ),
      s(
        {
          trig = "jLT",
          dscr = "Javascript Variable Declaration",
          priority = 1100,
        },
        fmt(
          [[
          const {variableName} = {declaration}
          ]],
          {
            variableName = i(1, "functionName"),
            declaration = i(2, "declaration"),
          }
        )
      ),
      s(
        {
          trig = "jIF",
          dscr = "Javascript If Clause",
          priority = 1100,
        },
        fmt(
          [[
          if ({}) {{
            {}
          }}
          ]],
          {
            i(1, "functionName"),
            i(2),
          }
        )
      ),
    }
