local colors = require("appearance")
local settings = require("settings")
local sbar = require("sketchybar")

-- Equivalent to the --bar domain
sbar.bar({
	color = colors.colors.macchiato.crust,
	height = settings.height,
	padding_right = 4,
	padding_left = 4,
	sticky = "on",
	topmost = "window",
	y_offset = 0,
	blur_radius = 20,
	border_width = 0,
})
