local colors = require("appearance")
local settings = require("settings")
local sbar = require("sketchybar")

-- Equivalent to the --bar domain
sbar.bar({
	color = colors.colors.macchiato.crust,
	height = settings.height,
	padding_right = 10,
	padding_left = 10,
	sticky = "on",
	topmost = "window",
	y_offset = 4,
	blur_radius = 20,
	border_width = 0,
	-- Floating bar appearance
	margin = 8,
	corner_radius = 10,
	-- Notch awareness - creates gap for MacBook camera
	-- notch_width = 200,
	-- notch_offset = 0,
})
