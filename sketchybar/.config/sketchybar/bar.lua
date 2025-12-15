local settings = require("settings")
local sbar = require("sketchybar")

-- Equivalent to the --bar domain
sbar.bar({
	display = "main",
	color = 0x00000000,
	height = 40,

	padding_right = 0,
	padding_left = 0,

	sticky = "on",
	topmost = "window",
	y_offset = 4,
	blur_radius = 20,
	border_width = 0,
	-- Floating bar appearance
	margin = 10,
	corner_radius = 10,
	-- Notch awareness - creates gap for MacBook camera
	-- notch_width = 200,
	-- notch_offset = 0,
})
