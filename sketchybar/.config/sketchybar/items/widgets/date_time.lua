local sbar = require("sketchybar")
local fonts = require("fonts")
local appearance = require("appearance")
local colors = appearance.colors

-- Padding item required because of bracket
sbar.add("item", { position = "right", width = 4 })

local time = sbar.add("item", "time", {
	position = "right",
	padding_right = -10,
	update_freq = 1,
	width = 0,
	label = {
		color = colors.white,
		font = {
			family = fonts.font.text,
			style = "Bold",
			size = 9,
		},
	},
	y_offset = 7,
})

local date = sbar.add("item", "date", {
	position = "right",
	y_offset = -5,
	padding_right = -13,
	update_freq = 60,
	label = {
		color = colors.white,
		font = {
			family = fonts.font.text,
			style = "Medium",
			size = 8,
		},
	},
})

time:subscribe({ "forced", "routine", "system_woke" }, function()
	local up_value = os.date("%H:%M:%S %Z")
	time:set({ label = { string = up_value } })
end)

date:subscribe({ "forced", "routine", "system_woke" }, function()
	local down_value = os.date("%a %b %d %Y")
	date:set({ label = { string = down_value } })
end)

local left_click_script =
	[[osascript -e 'tell application "System Events" to tell process "Dato" to click menu bar item 1 of menu bar 2']]
local right_click_script =
	'osascript -e \'tell application "System Events" to tell process "ControlCenter" to click menu bar item 2 of menu bar 1\''

local middle_click_script = "open -a Calendar"

date:subscribe("mouse.clicked", function(env)
	if env.BUTTON == "left" then
		sbar.exec(left_click_script)
	elseif env.BUTTON == "right" then
		sbar.exec(right_click_script)
	else
		sbar.exec(middle_click_script)
	end
end)

time:subscribe("mouse.clicked", function(env)
	if env.BUTTON == "left" then
		sbar.exec(left_click_script)
	elseif env.BUTTON == "right" then
		sbar.exec(right_click_script)
	else
		sbar.exec(middle_click_script)
	end
end)
