local icons = require("icons")
local sbar = require("sketchybar")
local colors = require("appearance").colors

local apple = sbar.add("item", {
	icon = {
		padding_left = 8,
		padding_right = 8,
		string = icons.apple,
		color = colors.active.mauve,
		font = { size = 14.0 },
	},
	label = { drawing = false },
	click_script = "$CONFIG_DIR/helpers/menus/bin/menus -s 0",
})

apple:subscribe("mouse.clicked", function()
	sbar.animate("tanh", 8, function()
		apple:set({
			y_offset = -2,
		})
		apple:set({
			y_offset = 0,
		})
	end)
end)
