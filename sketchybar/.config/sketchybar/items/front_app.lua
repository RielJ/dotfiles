local fonts = require("fonts")
local sbar = require("sketchybar")
local colors = require("appearance").colors

-- Active window/app display (appears after all workspace numbers)
-- Using position "q" places it after items with position "left"
local front_app = sbar.add("item", "front_app", {
	position = "left",
	display = "active",
	icon = {
		drawing = true,
		font = {
			family = fonts.font_icon.text,
			style = fonts.font_icon.style_map["Regular"],
			size = fonts.font_icon.size,
		},
		color = colors.active.text,
		padding_left = 4,
		padding_right = 2,
	},
	label = {
		font = {
			family = fonts.font.text,
			style = fonts.font.style_map["Regular"],
			size = 13.0,
		},
		color = colors.active.text,
		padding_left = 0,
		padding_right = 8,
	},
	updates = true,
})

-- Move front_app after workspace.10 (rightmost workspace)
sbar.exec("sleep 0.5 && sketchybar --move front_app after workspace.10", function() end)

local app_icons = {
	-- Terminals
	["kitty"] = "",
	["alacritty"] = "",
	["iTerm"] = "",
	["iTerm2"] = "",
	["Terminal"] = "",
	["Warp"] = "",
	["WezTerm"] = "",
	["Ghostty"] = "",

	-- Browsers
	["Google Chrome"] = "", -- nf-dev-chrome
	["Firefox"] = "", -- nf-dev-firefox
	["Zen"] = "", -- zen/meditation icon

	-- Music
	["Spotify"] = "", -- nf-fa-spotify
	["Music"] = "", -- nf-md-music
	["Apple Music"] = "", -- nf-md-music

	-- Communication
	["Slack"] = "", -- nf-md-slack
	["Discord"] = "", -- nf-md-discord
	["Messages"] = "󰵅", -- nf-md-message
	["Telegram"] = "", -- nf-fa-telegram
	["WhatsApp"] = "", -- nf-md-whatsapp

	-- Development
	["Docker Desktop"] = "", -- nf-dev-docker
	["Notion"] = "", -- nf-md-file_document
	["Photos"] = "", -- nf-md-image

	-- Default
	["default"] = "",
}

-- Update on front app switch
front_app:subscribe("front_app_switched", function(env)
	local app_name = env.INFO or ""
	local app_icon = app_icons[app_name] or app_icons["default"]
	front_app:set({ label = { string = app_name } })
end)

front_app:subscribe("mouse.clicked", function()
	sbar.exec("aerospace workspace next")
end)
