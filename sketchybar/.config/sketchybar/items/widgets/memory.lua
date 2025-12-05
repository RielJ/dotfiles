local icons = require("icons")
local colors = require("appearance").colors
local sbar = require("sketchybar")
local fonts = require("fonts")

-- Memory widget:  {used}GB
local memory = sbar.add("item", "widgets.memory", {
	position = "right",
	update_freq = 15,
	icon = {
		string = icons.memory,
		font = {
			family = fonts.font_icon.text,
			style = fonts.font_icon.style_map["Regular"],
			size = fonts.font_icon.size,
		},
		color = colors.active.pink,
		padding_left = 8,
		padding_right = 0,
	},
	label = {
		string = "??GB",
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

memory:subscribe({ "routine", "system_woke" }, function()
	sbar.exec("memory_pressure | grep 'System-wide memory free percentage' | awk '{print 100-$5}'", function(used_pct)
		-- Get memory in GB
		sbar.exec("sysctl -n hw.memsize", function(total_bytes)
			local total_gb = tonumber(total_bytes) / (1024 * 1024 * 1024)
			local used_percent = tonumber(used_pct) or 0
			local used_gb = (total_gb * used_percent) / 100
			memory:set({
				label = { string = string.format("%.1fGB", used_gb) },
			})
		end)
	end)
end)

memory:subscribe("mouse.clicked", function()
	sbar.exec("open -a 'Activity Monitor'")
end)
