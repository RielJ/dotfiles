local sbar = require("sketchybar")
local colors = require("appearance").colors
local icons = require("icons")
local fonts = require("fonts")

-- Clock widget (rightmost) - matching waybar:  {date}   {time}
local cal = sbar.add("item", "widgets.calendar", {
	position = "right",
	update_freq = 30,
	icon = {
		string = icons.calendar,
		font = {
			family = fonts.font_icon.text,
			style = fonts.font_icon.style_map["Regular"],
			size = fonts.font_icon.size,
		},
		color = colors.active.lavender,
		padding_left = 8,
		padding_right = 0,
	},
	label = {
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

cal:subscribe({ "forced", "routine", "system_woke" }, function()
	-- Format: " Sat, 06 Dec   04:30 PM" (matching waybar)
	local date_str = os.date("%a, %d %b")
	local time_str = os.date("%I:%M %p")
	cal:set({ label = { string = date_str .. " " .. time_str } })
end)

cal:subscribe("mouse.clicked", function()
	sbar.exec("open -a Calendar")
end)
