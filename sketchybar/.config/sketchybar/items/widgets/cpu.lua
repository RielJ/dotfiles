local icons = require("icons")
local colors = require("appearance").colors
local sbar = require("sketchybar")
local fonts = require("fonts")

-- Execute the event provider binary which provides the event "cpu_update" for
-- the cpu load data, which is fired every 2.0 seconds.
sbar.exec("killall cpu_load >/dev/null; $CONFIG_DIR/helpers/event_providers/cpu_load/bin/cpu_load cpu_update 2.0")

-- CPU widget:  {usage}%
local cpu = sbar.add("item", "widgets.cpu", {
	position = "right",
	icon = {
		string = icons.cpu,
		font = {
			family = fonts.font_icon.text,
			style = fonts.font_icon.style_map["Regular"],
			size = fonts.font_icon.size,
		},
		color = colors.active.blue,
		padding_left = 8,
		padding_right = 0,
	},
	label = {
		string = "??%",
		font = {
			family = fonts.font.text,
			style = fonts.font.style_map["Regular"],
			size = fonts.font.size,
		},
		color = colors.active.text,
		padding_left = 4,
		padding_right = 8,
	},
})

cpu:subscribe("cpu_update", function(env)
	local load = tonumber(env.total_load)
	local color = colors.active.blue

	if load > 80 then
		color = colors.active.red
	elseif load > 60 then
		color = colors.active.peach
	elseif load > 30 then
		color = colors.active.yellow
	end

	cpu:set({
		icon = { color = color },
		label = { string = env.total_load .. "%" },
	})
end)

cpu:subscribe("mouse.clicked", function()
	sbar.exec("open -a 'Activity Monitor'")
end)
