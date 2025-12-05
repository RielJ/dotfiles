local icons = require("icons")
local colors = require("appearance").colors
local sbar = require("sketchybar")
local fonts = require("fonts")

-- Battery widget:  {capacity}%
local battery = sbar.add("item", "widgets.battery", {
	position = "right",
	update_freq = 120,
	icon = {
		string = icons.battery._100,
		font = {
			family = fonts.font_icon.text,
			style = fonts.font_icon.style_map["Regular"],
			size = fonts.font_icon.size,
		},
		color = colors.active.green,
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

battery:subscribe({ "routine", "power_source_change", "system_woke" }, function()
	sbar.exec("pmset -g batt", function(batt_info)
		local icon = icons.battery._0
		local label = "??"
		local color = colors.active.green

		local found, _, charge = batt_info:find("(%d+)%%")
		if found then
			charge = tonumber(charge)
			label = charge .. "%"

			if charge > 80 then
				icon = icons.battery._100
				color = colors.active.green
			elseif charge > 60 then
				icon = icons.battery._75
				color = colors.active.green
			elseif charge > 40 then
				icon = icons.battery._50
				color = colors.active.yellow
			elseif charge > 20 then
				icon = icons.battery._25
				color = colors.active.peach
			else
				icon = icons.battery._0
				color = colors.active.red
			end
		end

		local charging = batt_info:find("AC Power")
		if charging then
			icon = icons.battery.charging
			color = colors.active.yellow
		end

		battery:set({
			icon = { string = icon, color = color },
			label = { string = label },
		})
	end)
end)

battery:subscribe("mouse.clicked", function()
	sbar.exec("open /System/Library/PreferencePanes/Battery.prefPane")
end)
