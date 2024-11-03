vim.api.nvim_create_user_command("Format", function(args)
  local range = nil
  if args.count ~= -1 then
    local end_line = vim.api.nvim_buf_get_lines(0, args.line2 - 1, args.line2, true)[1]
    range = {
      start = { args.line1, 0 },
      ["end"] = { args.line2, end_line:len() },
    }
  end
  require("conform").format({ timeout_ms = 4000, lsp_format = "fallback", range = range, stop_after_first = true })
end, { range = true })

-- vim.api.nvim_create_autocmd({ "BufWritePre" }, {
--   pattern = "*",
--   callback = vim.cmd("Format")
-- })
