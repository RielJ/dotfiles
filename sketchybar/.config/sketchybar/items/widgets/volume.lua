local colors = require("appearance").colors
local icons = require("icons")
local sbar = require("sketchybar")
local fonts = require("fonts")

-- Volume widget:  {volume}%
local volume = sbar.add("item", "widgets.volume", {
	position = "right",
	icon = {
		string = icons.volume._100,
		font = {
			family = fonts.font_icon.text,
			style = fonts.font_icon.style_map["Regular"],
			size = fonts.font_icon.size,
		},
		color = colors.active.teal,
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

volume:subscribe("volume_change", function(env)
	local vol = tonumber(env.INFO)
	local icon = icons.volume._0
	if vol > 60 then
		icon = icons.volume._100
	elseif vol > 30 then
		icon = icons.volume._66
	elseif vol > 10 then
		icon = icons.volume._33
	elseif vol > 0 then
		icon = icons.volume._10
	end

	volume:set({
		icon = { string = icon },
		label = { string = vol .. "%" },
	})
end)

volume:subscribe("mouse.clicked", function(env)
	if env.BUTTON == "right" then
		sbar.exec("open /System/Library/PreferencePanes/Sound.prefpane")
	else
		sbar.exec("open -a 'Music'")
	end
end)

volume:subscribe("mouse.scrolled", function(env)
	local delta = env.SCROLL_DELTA
	if delta then
		local direction = delta > 0 and 5 or -5
		sbar.exec('osascript -e "set volume output volume (output volume of (get volume settings) + ' .. direction .. ')"')
	end
end)
