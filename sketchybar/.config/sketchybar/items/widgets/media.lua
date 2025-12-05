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

-- Media widget (anchor)
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
		horizontal = false,
		align = "center",
	},
})

-- Popup: Title (row 1)
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
		max_chars = 30,
	},
	width = popup_width,
	align = "center",
})

-- Popup: Artist (row 2)
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
		max_chars = 35,
	},
	width = popup_width,
	align = "center",
})

-- Popup: Cover art (row 3)
local popup_cover = sbar.add("item", {
	position = "popup." .. media.name,
	icon = { drawing = false },
	label = { drawing = false },
	width = popup_width,
	align = "center",
	background = {
		drawing = true,
		height = 10,
		corner_radius = 8,
		image = {
			padding_left = 61,
			string = "/tmp/media_artwork.jpg",
			scale = 1,
			drawing = true,
		},
		color = 0x00000000,
	},
})

-- Popup: Controls (row 4) - fused prev | play | next in one item
local popup_controls = sbar.add("item", {
	position = "popup." .. media.name,
	icon = {
		string = prev_icon .. "       " .. play_icon .. "       " .. next_icon,
		font = {
			family = fonts.font_icon.text,
			style = fonts.font_icon.style_map["Regular"],
			size = 18.0,
		},
		color = colors.active.text,
	},
	label = { drawing = false },
	width = popup_width,
	align = "center",
})

-- Track current state
local current_state = {
	playing = false,
	title = "",
	artist = "",
	album = "",
	bundle_id = "",
}

-- Helper to update popup content
local function update_popup()
	local play_pause_icon = current_state.playing and pause_icon or play_icon

	popup_title:set({ label = { string = current_state.title } })
	popup_artist:set({ label = { string = current_state.artist } })
	popup_controls:set({
		icon = { string = prev_icon .. "       " .. play_pause_icon .. "       " .. next_icon },
	})
end

-- Helper to set media display
local function set_media(bundle_id, title, artist, album, is_playing)
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
	current_state.album = album or ""
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
	-- Extract artwork and save to file, then get other fields
	sbar.exec(
		[[media-control get 2>/dev/null | jq -r '.artworkData // empty' | base64 -d | magick jpg:- -resize 128x128 jpg:/tmp/media_artwork.jpg 2>/dev/null; media-control get 2>/dev/null | jq -r '[.playing // false, .title // "", .artist // "", .album // "", .bundleIdentifier // ""] | @tsv' 2>/dev/null]],
		function(result)
			result = result:gsub("^%s*(.-)%s*$", "%1") -- trim

			-- Check for empty result
			if result == "" then
				hide_media()
				return
			end

			-- Parse tab-separated values
			local playing, title, artist, album, bundle_id =
				result:match("([^\t]*)\t([^\t]*)\t([^\t]*)\t([^\t]*)\t([^\t]*)")

			-- Show media if there's a title (regardless of playing state)
			if title and title ~= "" then
				set_media(bundle_id, title, artist, album, playing == "true")
				-- Refresh the cover image
				popup_cover:set({
					background = {
						height = 10,
						corner_radius = 8,
						image = {
							padding_left = 61,
							string = "/tmp/media_artwork.jpg",
							scale = 1,
						},
					},
				})
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

-- Controls click handler - detect which part was clicked (prev | play | next)
popup_controls:subscribe("mouse.clicked", function(env)
	local x = tonumber(env.X) or 0
	local width = popup_width
	if x < width / 3 then
		sbar.exec("media-control previous 2>/dev/null")
	elseif x > width * 2 / 3 then
		sbar.exec("media-control next 2>/dev/null")
	else
		sbar.exec("media-control toggle-play-pause 2>/dev/null")
	end
	sbar.delay(0.5, update_media)
end)

-- Cover click opens the app
popup_cover:subscribe("mouse.clicked", function()
	if current_state.bundle_id and current_state.bundle_id ~= "" then
		sbar.exec("open -b " .. current_state.bundle_id)
	end
	hide_popup()
end)
