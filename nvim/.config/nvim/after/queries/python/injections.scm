; extends

;; Automatic SQL highlighting for database method calls
;; Matches first string arg in: conn.execute("""..."""), pool.fetchrow("""..."""), etc.
(call
  function: (attribute
    attribute: (identifier) @_method)
  arguments: (argument_list
    .
    (string
      (string_content) @injection.content))
  (#any-of? @_method
    "execute" "executemany"
    "fetch" "fetchrow" "fetchone" "fetchall" "fetchval" "fetchmany"
    "mogrify")
  (#set! injection.language "sql")
  (#set! injection.include-children))

;; Fallback: Strings starting with "-- sql" comment
(((string_content) @_sql
  (#lua-match? @_sql "^%s*%-%-[ ]*[Ss][Qq][Ll]")) @injection.content
  (#set! injection.language "sql")
  (#set! injection.include-children))
