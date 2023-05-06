local M = {}

M.imap = function(tbl)
  vim.keymap.set("i", tbl[1], tbl[2], tbl[3])
end

M.nmap = function(tbl)
  vim.keymap.set("n", tbl[1], tbl[2], tbl[3])
end

M.map = function(modes, lhs, rhs, opts)
  opts = opts or {}
  opts.noremap = opts.noremap == nil and true or opts.noremap
  if type(modes) == "string" then
    modes = { modes }
  end
  for _, mode in ipairs(modes) do
    if type(rhs) == "string" then
      vim.api.nvim_set_keymap(mode, lhs, rhs, opts)
    else
      opts.callback = rhs
      vim.api.nvim_set_keymap(mode, lhs, "", opts)
    end
  end
end

return M
