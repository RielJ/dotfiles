local M = {}

M.config = function()
	local status_ok, gps = pcall(require, "nvim-gps")
	if not status_ok then
		return
	end

	gps.setup({
		icons = {
			["class-name"] = " ", -- Classes and class-like objects
			["function-name"] = " ", -- Functions
			["method-name"] = " ", -- Methods (functions inside class-like objects)
			["container-name"] = "⛶ ", -- Containers (example: lua tables)
			["tag-name"] = "炙", -- Tags (example: html tags)
		},
		languages = { -- You can disable any language individually here
			["c"] = true,
			["cpp"] = true,
			["go"] = true,
			["java"] = true,
			["javascript"] = true,
			["typescript"] = true,
			["lua"] = true,
			["python"] = true,
			["rust"] = true,
		},
		separator = " > ",
	})
end

return M
