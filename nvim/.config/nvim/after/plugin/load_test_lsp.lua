-- @diagnostic disable-next-line: missing-fields
local client = vim.lsp.start_client {
  name = "educationallsp",
  cmd = { "/home/rielj/engineering/projects/go-educationallsp/main" },
  on_attach = require("rielj.lsp.handlers").common_on_attach,
}

if not client then
  vim.notify "Failed to start educationallsp"
  return
end

vim.api.nvim_create_autocmd("FileType", {
  pattern = "markdown",
  callback = function()
    vim.lsp.buf_attach_client(0, client)
  end,
})
