local M = {}
M.setup = function()
  local compile_path = vim.fn.stdpath "config" .. "/plugin/packer_compiled.lua"
  local install_path = vim.fn.stdpath "data" .. "/site/pack/packer/start/packer.nvim"
  local package_root = vim.fn.stdpath "data" .. "/site/pack"

  if vim.fn.empty(vim.fn.glob(install_path)) > 0 then
    vim.fn.system { "git", "clone", "--depth", "1", "https://github.com/wbthomason/packer.nvim", install_path }
    vim.cmd "packadd packer.nvim"
  end

  local packer_ok, packer = pcall(require, "packer")
  if not packer_ok then
    return
  end

  packer.init {
    package_root = package_root,
    compile_path = compile_path,
    git = { clone_timeout = 300 },
    display = {
      open_fn = function()
        return require("packer.util").float { border = "rounded" }
      end,
    },
  }
end
return M
