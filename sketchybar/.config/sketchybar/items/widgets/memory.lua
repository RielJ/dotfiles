local icons = require("icons")
local colors = require("appearance").colors
local sbar = require("sketchybar")
local fonts = require("fonts")

-- Memory widget:  {used}GB
local memory = sbar.add("item", "widgets.memory", {
	position = "right",
	update_freq = 2,
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
	sbar.exec("vm_stat | awk '/Pages (active|inactive|speculative|wired|occupied by compressor)/ {sum+=$NF} END {printf \"%.1f\", sum*4096/1073741824}'", function(used_gb_str)
		local used_gb = tonumber(used_gb_str) or 0
		memory:set({
			label = { string = string.format("%.1fGB", used_gb) },
		})
	end)
end)

memory:subscribe("mouse.clicked", function()
	sbar.exec("open -a 'Activity Monitor'")
end)
