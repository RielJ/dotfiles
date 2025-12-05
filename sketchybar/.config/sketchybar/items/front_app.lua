local fonts = require("fonts")
local sbar = require("sketchybar")
local colors = require("appearance").colors

-- Active window/app display (appears after all workspace numbers)
-- Using position "q" places it after items with position "left"
local front_app = sbar.add("item", "front_app", {
	position = "left",
	display = "active",
	icon = {
		drawing = false,
	},
	label = {
		font = {
			family = fonts.font.text,
			style = fonts.font.style_map["Regular"],
			size = 13.0,
		},
		color = colors.active.text,
		padding_left = 8,
		padding_right = 8,
	},
	updates = true,
})

-- Move front_app after workspace.10 (rightmost workspace)
sbar.exec("sleep 0.5 && sketchybar --move front_app after workspace.10", function() end)

-- Update on front app switch
front_app:subscribe("front_app_switched", function(env)
	local app_name = env.INFO or ""
	front_app:set({ label = { string = app_name } })
end)

front_app:subscribe("mouse.clicked", function()
	sbar.exec("aerospace workspace next")
end)
