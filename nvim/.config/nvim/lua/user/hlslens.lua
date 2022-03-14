local M = {}

M.config = function()
	local status_ok, hlslens = pcall(require, "hlslens")
	if not status_ok then
		return
	end

	hlslens.setup({
		auto_enable = true,
		calm_down = true,
		enable_incsearch = false,
		nearest_only = false,
		override_lens = function(render, plist, nearest, idx, r_idx)
			local sfw = vim.v.searchforward == 1
			local indicator, text, chunks
			local abs_r_idx = math.abs(r_idx)
			if abs_r_idx > 1 then
				indicator = string.format("%d%s", abs_r_idx, sfw ~= (r_idx > 1) and "" or "")
			elseif abs_r_idx == 1 then
				indicator = sfw ~= (r_idx == 1) and "" or ""
			else
				indicator = ""
			end

			local lnum, col = unpack(plist[idx])
			if nearest then
				local cnt = #plist
				if indicator ~= "" then
					text = string.format("[%s %d/%d]", indicator, idx, cnt)
				else
					text = string.format("[%d/%d]", idx, cnt)
				end
				chunks = { { " ", "Ignore" }, { text, "HlSearchLensNear" } }
			else
				text = string.format("[%s %d]", indicator, idx)
				chunks = { { " ", "Ignore" }, { text, "HlSearchLens" } }
			end
			render.set_virt(0, lnum - 1, col - 1, chunks, nearest)
		end,
	})
	local keymap_opts = { noremap = true, silent = true }
	vim.api.nvim_set_keymap(
		"n",
		"n",
		"<Cmd>execute('normal! ' . v:count1 . 'n')<CR><Cmd>lua require('hlslens').start()<CR>",
		keymap_opts
	)
	vim.api.nvim_set_keymap(
		"n",
		"N",
		"<Cmd>execute('normal! ' . v:count1 . 'N')<CR><Cmd>lua require('hlslens').start()<CR>",
		keymap_opts
	)
	vim.api.nvim_set_keymap("n", "*", "*<Cmd>lua require('hlslens').start()<CR>", keymap_opts)
	vim.api.nvim_set_keymap("n", "#", "#<Cmd>lua require('hlslens').start()<CR>", keymap_opts)
	vim.api.nvim_set_keymap("n", "g*", "g*<Cmd>lua require('hlslens').start()<CR>", keymap_opts)
	vim.api.nvim_set_keymap("n", "g#", "g#<Cmd>lua require('hlslens').start()<CR>", keymap_opts)
end

return M
