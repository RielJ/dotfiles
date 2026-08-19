local M = {}
local Terminal = require("toggleterm.terminal").Terminal
-- Resolve the shell's working SSH agent socket (persisted by zsh) so that
-- lazygit can sign commits even when nvim itself inherited a different
-- (key-less) launchd socket.
local function resolve_ssh_auth_sock()
  local path = vim.env.HOME .. "/.ssh/ssh-auth-sock.path"
  local f = io.open(path, "r")
  if f then
    local sock = f:read("*l")
    f:close()
    if sock and sock ~= "" then
      return sock
    end
  end
  return vim.env.SSH_AUTH_SOCK
end

local lazygit = Terminal:new({
  cmd = "lazygit",
  hidden = true,
  direction = "float",
  close_on_exit = true,
  env = {
    NVIM = vim.v.servername,
    SSH_AUTH_SOCK = resolve_ssh_auth_sock(),
  },
  float_opts = {
    border = "curved",
    winblend = 0,
    highlights = {
      border = "Normal",
      background = "Normal",
    },
  },
  on_open = function(term)
    vim.cmd("startinsert!")
    -- Auto-close lazygit when a file is opened from it (via NVIM remote protocol)
    vim.api.nvim_create_autocmd("BufEnter", {
      group = vim.api.nvim_create_augroup("LazyGitClose", { clear = true }),
      callback = function(ev)
        if vim.bo[ev.buf].buftype == "" and term:is_open() then
          vim.schedule(function()
            term:close()
            vim.cmd("stopinsert")
          end)
          return true -- removes the autocmd
        end
      end,
    })
  end,
  on_close = function(_)
    pcall(vim.api.nvim_del_augroup_by_name, "LazyGitClose")
    vim.cmd("stopinsert")
  end,
  count = 99,
})

M._exec_toggle = function(opts)
  local term = Terminal:new({ cmd = opts.cmd, count = opts.count, direction = opts.direction })
  term:toggle(opts.size, opts.direction)
end

M._lazygit_toggle = function()
  lazygit:toggle()
end

return M
