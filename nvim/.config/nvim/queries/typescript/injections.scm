(call_expression
  function: [
    (identifier) @_name
    (await_expression (identifier) @_name)
    (instantiation_expression function: (identifier) @_name)
    (non_null_expression
      (instantiation_expression
        (await_expression
          (identifier) @_name)))
  ]
  arguments: (template_string) @injection.content
  (#any-of? @_name "sql" "tx" "sqlClient")
  (#set! injection.language "sql")
  (#set! injection.include-children))
