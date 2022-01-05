local fn = vim.fn
local M = {}
M.setup = function()
  local compile_path = vim.fn.stdpath "config" .. "/plugin/packer_compiled.lua"
  local install_path = vim.fn.stdpath "data" .. "/site/pack/packer/start/packer.nvim"
  local package_root = vim.fn.stdpath "data" .. "/site/pack"

  if fn.empty(fn.glob(install_path)) > 0 then
    PACKER_BOOTSTRAP = fn.system {
      "git",
      "clone",
      "--depth",
      "1",
      "https://github.com/wbthomason/packer.nvim",
      install_path,
    }
    print "Installing packer close and reopen Neovim..."
    vim.cmd [[packadd packer.nvim]]
  end

  -- Autocommand that reloads neovim whenever you save the plugins.lua file
  vim.cmd [[
    augroup packer_user_config
      autocmd!
      autocmd BufWritePost plugins.lua source <afile> | PackerSync
    augroup end
  ]]

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
