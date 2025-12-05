local colors = require("appearance").colors
local sbar = require("sketchybar")
local fonts = require("fonts")

-- Register Spotify's NSDistributedNotification for playback changes
sbar.add("event", "spotify_change", "com.spotify.client.PlaybackStateChanged")

-- App icons (NerdFont) - keyed by bundle identifier
local app_icons = {
	["com.spotify.client"] = "\u{f1bc}",
	["com.apple.Music"] = "\u{f001}",
	["com.google.Chrome"] = "\u{f268}",
	["com.apple.Safari"] = "\u{f267}",
	["org.mozilla.firefox"] = "\u{f269}",
	["company.thebrowser.Browser"] = "\u{f268}",
	["app.zen-browser.zen"] = "\u{f269}",
	["default"] = "\u{f04b}",
}

-- App colors - keyed by bundle identifier
local app_colors = {
	["com.spotify.client"] = 0xff1db954,
	["com.apple.Music"] = 0xfffa586a,
	["com.google.Chrome"] = 0xff4285f4,
	["com.apple.Safari"] = 0xff0fb5ee,
	["org.mozilla.firefox"] = 0xffff7139,
	["company.thebrowser.Browser"] = 0xfffc7b54,
	["app.zen-browser.zen"] = 0xff7c3aed,
	["default"] = colors.active.mauve,
}

-- Play/pause icons
local play_icon = "\u{f04b}" -- 
local pause_icon = "\u{f04c}" -- 
local prev_icon = "\u{f048}" -- 
local next_icon = "\u{f051}" -- 

local popup_width = 250

-- Media widget
local media = sbar.add("item", "widgets.media", {
	position = "q",
	drawing = false,
	update_freq = 3,
	scroll_texts = true,
	icon = {
		string = app_icons["default"],
		font = {
			family = fonts.font_icon.text,
			style = fonts.font_icon.style_map["Regular"],
			size = fonts.font_icon.size,
		},
		color = colors.active.mauve,
		padding_left = 8,
		padding_right = 4,
	},
	label = {
		string = "",
		font = {
			family = fonts.font.text,
			style = fonts.font.style_map["Regular"],
			size = fonts.font.size,
		},
		color = colors.active.text,
		padding_left = 0,
		padding_right = 8,
		max_chars = 30,
		scroll_duration = 200,
	},
	popup = {
		align = "center",
		height = 40,
	},
})

-- Popup: Artwork
local popup_artwork = sbar.add("item", {
	position = "popup." .. media.name,
	icon = {
		drawing = true,
		string = " ",
		padding_left = 0,
		padding_right = 0,
	},
	label = { drawing = false },
	background = {
		drawing = true,
		image = {
			string = "media.artwork",
			scale = 0.6,
			drawing = true,
		},
		color = 0x00000000,
	},
	width = popup_width,
})

-- Popup: Title
local popup_title = sbar.add("item", {
	position = "popup." .. media.name,
	icon = { drawing = false },
	label = {
		string = "Title",
		font = {
			family = fonts.font.text,
			style = fonts.font.style_map["Bold"],
			size = 13.0,
		},
		color = colors.active.text,
		max_chars = 28,
		width = popup_width,
		align = "center",
	},
	width = popup_width,
})

-- Popup: Artist
local popup_artist = sbar.add("item", {
	position = "popup." .. media.name,
	icon = { drawing = false },
	label = {
		string = "Artist",
		font = {
			family = fonts.font.text,
			style = fonts.font.style_map["Regular"],
			size = 11.0,
		},
		color = colors.active.overlay1,
		max_chars = 32,
		width = popup_width,
		align = "center",
	},
	width = popup_width,
})

-- Popup: Spacer/divider
local popup_divider = sbar.add("item", {
	position = "popup." .. media.name,
	icon = { drawing = false },
	label = { drawing = false },
	width = popup_width,
	height = 10,
})

-- Popup: Controls - using a single item with icon and label for layout
local popup_prev = sbar.add("item", {
	position = "popup." .. media.name,
	icon = {
		string = prev_icon,
		font = {
			family = fonts.font_icon.text,
			style = fonts.font_icon.style_map["Regular"],
			size = 20.0,
		},
		color = colors.active.text,
		width = popup_width / 3,
		align = "center",
	},
	label = { drawing = false },
	width = popup_width / 3,
})

local popup_play = sbar.add("item", {
	position = "popup." .. media.name,
	icon = {
		string = play_icon,
		font = {
			family = fonts.font_icon.text,
			style = fonts.font_icon.style_map["Regular"],
			size = 26.0,
		},
		color = colors.active.mauve,
		width = popup_width / 3,
		align = "center",
	},
	label = { drawing = false },
	width = popup_width / 3,
})

local popup_next = sbar.add("item", {
	position = "popup." .. media.name,
	icon = {
		string = next_icon,
		font = {
			family = fonts.font_icon.text,
			style = fonts.font_icon.style_map["Regular"],
			size = 20.0,
		},
		color = colors.active.text,
		width = popup_width / 3,
		align = "center",
	},
	label = { drawing = false },
	width = popup_width / 3,
})

-- Bracket the controls to put them on the same row
sbar.add("bracket", "widgets.media.controls", {
	popup_prev.name,
	popup_play.name,
	popup_next.name,
}, {
	background = { drawing = false },
})

-- Track current state
local current_state = {
	playing = false,
	title = "",
	artist = "",
	bundle_id = "",
}

-- Helper to update popup content
local function update_popup()
	local app_color = app_colors[current_state.bundle_id] or app_colors["default"]
	local play_pause_icon = current_state.playing and pause_icon or play_icon

	popup_title:set({ label = { string = current_state.title } })
	popup_artist:set({ label = { string = current_state.artist } })
	popup_play:set({
		icon = {
			string = play_pause_icon,
			color = app_color,
		},
	})
end

-- Helper to set media display
local function set_media(bundle_id, title, artist, is_playing)
	local app_icon = app_icons[bundle_id] or app_icons["default"]
	local app_color = app_colors[bundle_id] or app_colors["default"]

	-- Use play/pause icon to indicate state
	local state_icon = is_playing and app_icon or pause_icon

	-- Dim the color when paused
	local icon_color = is_playing and app_color or colors.active.overlay1
	local label_color = is_playing and colors.active.text or colors.active.overlay1

	local label = title or ""
	if artist and artist ~= "" then
		label = artist .. " - " .. label
	end

	-- Update current state
	current_state.playing = is_playing
	current_state.title = title or ""
	current_state.artist = artist or ""
	current_state.bundle_id = bundle_id or ""

	media:set({
		drawing = true,
		icon = { string = state_icon, color = icon_color },
		label = { string = label, color = label_color },
	})

	-- Update popup content
	update_popup()
end

-- Helper to hide media
local function hide_media()
	media:set({ drawing = false, popup = { drawing = false } })
end

-- Main update using media-control
local function update_media()
	-- Use jq to extract only the fields we need, avoiding massive artworkData
	sbar.exec(
		"media-control get 2>/dev/null | jq -r '[.playing // false, .title // \"\", .artist // \"\", .bundleIdentifier // \"\"] | @tsv' 2>/dev/null",
		function(result)
			result = result:gsub("^%s*(.-)%s*$", "%1") -- trim

			-- Check for empty result
			if result == "" then
				hide_media()
				return
			end

			-- Parse tab-separated values: playing, title, artist, bundleIdentifier
			local playing, title, artist, bundle_id = result:match("([^\t]*)\t([^\t]*)\t([^\t]*)\t([^\t]*)")

			-- Show media if there's a title (regardless of playing state)
			if title and title ~= "" then
				set_media(bundle_id, title, artist, playing == "true")
			else
				hide_media()
			end
		end
	)
end

-- Popup toggle
local function hide_popup()
	media:set({ popup = { drawing = false } })
end

local function toggle_popup()
	local should_draw = media:query().popup.drawing == "off"
	if should_draw then
		update_popup()
		media:set({ popup = { drawing = true } })
	else
		hide_popup()
	end
end

-- Subscribe to events
media:subscribe("spotify_change", update_media)
media:subscribe("media_change", update_media)
media:subscribe({ "routine", "system_woke" }, update_media)

-- Click to toggle popup
media:subscribe("mouse.clicked", function(env)
	if env.BUTTON == "left" then
		toggle_popup()
	elseif env.BUTTON == "right" then
		sbar.exec("media-control next 2>/dev/null")
		sbar.delay(0.5, update_media)
	end
end)

-- Hide popup when mouse leaves
media:subscribe("mouse.exited.global", hide_popup)

-- Scroll to skip tracks
media:subscribe("mouse.scrolled", function(env)
	local delta = env.SCROLL_DELTA
	if delta and delta > 0 then
		sbar.exec("media-control next 2>/dev/null")
	elseif delta and delta < 0 then
		sbar.exec("media-control previous 2>/dev/null")
	end
	sbar.delay(0.5, update_media)
end)

-- Popup control buttons
popup_prev:subscribe("mouse.clicked", function()
	sbar.exec("media-control previous 2>/dev/null")
	sbar.delay(0.5, update_media)
end)

popup_play:subscribe("mouse.clicked", function()
	sbar.exec("media-control toggle-play-pause 2>/dev/null")
	sbar.delay(0.5, update_media)
end)

popup_next:subscribe("mouse.clicked", function()
	sbar.exec("media-control next 2>/dev/null")
	sbar.delay(0.5, update_media)
end)
