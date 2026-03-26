local colors = require("appearance").colors
local sbar = require("sketchybar")
local fonts = require("fonts")

-- NerdFont icons
local icon_wallpaper = "󰸉" -- nf-md-image_multiple
local icon_settings = "" -- nf-fa-gear
local icon_picker = "󰋩" -- nf-md-view_grid

local popup_width = 160

-- Main bar item
local wallpaper = sbar.add("item", "widgets.wallpaper", {
	position = "right",
	icon = {
		string = icon_wallpaper,
		font = {
			family = fonts.font_icon.text,
			style = fonts.font_icon.style_map["Regular"],
			size = fonts.font_icon.size,
		},
		color = colors.active.peach,
		padding_left = 8,
		padding_right = 8,
	},
	label = { drawing = false },
	popup = {
		horizontal = false,
		align = "center",
	},
})

-- Popup: Settings
local popup_settings = sbar.add("item", "wallpaper.settings", {
	position = "popup." .. wallpaper.name,
	icon = {
		string = icon_settings,
		font = {
			family = fonts.font_icon.text,
			style = fonts.font_icon.style_map["Regular"],
			size = 14.0,
		},
		color = colors.active.text,
		padding_left = 10,
		padding_right = 6,
	},
	label = {
		string = "Settings",
		font = {
			family = fonts.font.text,
			style = fonts.font.style_map["Regular"],
			size = 13.0,
		},
		color = colors.active.text,
		padding_right = 10,
	},
	width = popup_width,
})

-- Popup: Picker
local popup_picker = sbar.add("item", "wallpaper.picker", {
	position = "popup." .. wallpaper.name,
	icon = {
		string = icon_picker,
		font = {
			family = fonts.font_icon.text,
			style = fonts.font_icon.style_map["Regular"],
			size = 14.0,
		},
		color = colors.active.text,
		padding_left = 10,
		padding_right = 6,
	},
	label = {
		string = "Picker",
		font = {
			family = fonts.font.text,
			style = fonts.font.style_map["Regular"],
			size = 13.0,
		},
		color = colors.active.text,
		padding_right = 10,
	},
	width = popup_width,
})

-- Toggle popup on click
local function hide_popup()
	wallpaper:set({ popup = { drawing = false } })
end

wallpaper:subscribe("mouse.clicked", function(env)
	local should_draw = wallpaper:query().popup.drawing == "off"
	wallpaper:set({ popup = { drawing = should_draw } })
end)

-- Settings click → open GUI
popup_settings:subscribe("mouse.clicked", function(env)
	sbar.exec("wallpaperd settings 2>/dev/null || open ~/.local/share/wallpaperd/wallpaperd-settings.app 2>/dev/null &")
	hide_popup()
end)

-- Picker click → open picker
popup_picker:subscribe("mouse.clicked", function(env)
	sbar.exec("wallpaperd pick 2>/dev/null &")
	hide_popup()
end)

-- Close popup when clicking outside
wallpaper:subscribe("mouse.exited.global", function(env)
	hide_popup()
end)
