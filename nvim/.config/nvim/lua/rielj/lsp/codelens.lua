--- Code lenses on the same line as the code they describe.
---
--- Since Nvim 0.12/0.13 the built-in provider draws every lens as a virtual
--- line above its row (`virt_lines_above`), so each function with a
--- "0 references" lens costs a full screen row. There is no option for this
--- (neovim/neovim#39477 is open; maintainers rejected a one-off flag).
---
--- A terminal cannot draw above a row without spending a row, so the lens
--- moves onto the code row instead. We keep the built-in provider (requests,
--- resolve, refresh, `vim.lsp.codelens.run`) and only change how it draws:
--- while its decoration-provider `on_win` runs, `nvim_buf_set_extmark` calls
--- that carry `virt_lines` are rewritten to end-of-line `virt_text`.
---
--- If a future Nvim stops drawing with `virt_lines`, the wrapper passes calls
--- through untouched and lenses fall back to the upstream layout.
local M = {}

--- "eol" puts the lens right after the code; "right_align" pins it to the
--- window's right edge.
M.position = "eol"

local patched = false

---@param opts vim.api.keyset.set_extmark
---@return vim.api.keyset.set_extmark
local function to_inline(opts)
  local chunks = {}
  for _, chunk in ipairs(opts.virt_lines[1] or {}) do
    -- Drop the leading indent padding and the empty placeholder chunk.
    if chunk[1]:match("%S") then
      chunks[#chunks + 1] = chunk
    end
  end
  if #chunks > 0 then
    table.insert(chunks, 1, { "  ", "LspCodeLensSeparator" })
  end

  local inline = vim.deepcopy(opts)
  inline.virt_lines = nil
  inline.virt_lines_above = nil
  inline.virt_lines_overflow = nil
  inline.virt_text = chunks
  inline.virt_text_pos = M.position
  inline.hl_mode = "combine"
  return inline
end

function M.setup()
  if patched then
    return
  end
  require("vim.lsp.codelens") -- registers the provider in `all`
  local Provider = require("vim.lsp._capability").all.codelens
  if not (Provider and Provider.on_win) then
    return
  end
  patched = true

  local on_win = Provider.on_win
  Provider.on_win = function(self, ...)
    local set_extmark = vim.api.nvim_buf_set_extmark
    vim.api.nvim_buf_set_extmark = function(buf, ns, row, col, opts)
      if opts and opts.virt_lines then
        opts = to_inline(opts)
      end
      return set_extmark(buf, ns, row, col, opts)
    end
    local ok, err = pcall(on_win, self, ...)
    vim.api.nvim_buf_set_extmark = set_extmark
    if not ok then
      error(err, 0)
    end
  end
end

return M
