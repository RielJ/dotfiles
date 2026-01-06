local sbar = require("sketchybar")
local appearance = require("appearance")
local colors = appearance.colors
local app_icons = require("helpers.app_icons")
local fonts = require("fonts")

-- sbar.add("item", "divider", {
-- 	icon = {
-- 		font = { family = settings.default, size = 12 },
-- 		string = "│",
-- 		drawing = true,
-- 		color = colors.white,
-- 	},
-- 	padding_left = -2,
-- 	padding_right = 4,
-- 	position = "left",
-- })

local spaces = {}
local space_paddings = {} -- workspace_id -> padding item
local space_app_icons = {} -- workspace_id -> concatenated icon glyphs (string)
local space_app_names = {} -- workspace_id -> set/table of app names present in that space
local space_contains_front_app = {} -- workspace_id -> bool
local space_selected = {} -- workspace_id -> bool
local space_has_windows = {} -- workspace_id -> bool
local current_front_app = nil

-- init tables for workspaces 1-10
for i = 1, 10 do
	local ws = tostring(i)
	space_app_icons[ws] = "—"
	space_app_names[ws] = {}
	space_contains_front_app[ws] = false
	space_selected[ws] = false
	space_has_windows[ws] = false
end

-- Helper: update how a space looks
local function update_space_display(space, workspace_id, is_selected, has_front_app, has_windows)
	local icon_text = space_app_icons[workspace_id] or "—"
	local space_text = tostring(workspace_id)

	-- Only show workspace if it has windows OR is currently selected
	local should_draw = has_windows or is_selected

	-- Space number / highlight: white if selected, otherwise grey
	local icon_color = is_selected and colors.mocha.rosewater or colors.grey
	-- App icons: only highlight if this is the selected workspace
	local label_color = is_selected and colors.mocha.rosewater or colors.grey

	space:set({
		drawing = should_draw,
		icon = {
			string = space_text,
			highlight = is_selected,
			color = icon_color,
		},
		label = {
			string = icon_text,
			highlight = is_selected,
			color = label_color,
		},
	})

	-- Also update the padding visibility
	if space_paddings[workspace_id] then
		space_paddings[workspace_id]:set({ drawing = should_draw })
	end
end

-- Query aerospace for windows and update all workspaces
local function update_windows()
	local get_windows = "aerospace list-windows --monitor all --format '%{workspace}%{app-name}' --json"
	local get_focused_workspace = "aerospace list-workspaces --focused"

	sbar.exec(get_windows, function(windows_json)
		-- Reset all workspace app data
		for ws, _ in pairs(spaces) do
			space_app_icons[ws] = "—"
			space_app_names[ws] = {}
			space_contains_front_app[ws] = false
			space_has_windows[ws] = false
		end

		-- Build app icons and names per workspace
		local workspace_apps = {}
		for _, entry in ipairs(windows_json) do
			local ws = entry.workspace
			local app = entry["app-name"]

			if workspace_apps[ws] == nil then
				workspace_apps[ws] = {}
			end

			-- Only add each app once per workspace
			if not workspace_apps[ws][app] then
				workspace_apps[ws][app] = true
			end
		end

		-- Convert to icon strings
		for ws, apps in pairs(workspace_apps) do
			local icon_line = ""
			local appset = {}

			for app, _ in pairs(apps) do
				local lookup = app_icons[app] or app_icons["Default"]
				icon_line = icon_line .. lookup
				appset[app] = true
			end

			if icon_line == "" then
				icon_line = "—"
			end

			space_app_icons[ws] = icon_line
			space_app_names[ws] = appset
			space_has_windows[ws] = true -- This workspace has windows

			-- Check if this workspace contains the current front app
			if current_front_app and appset[current_front_app] then
				space_contains_front_app[ws] = true
			end
		end

		-- Get focused workspace and update displays
		sbar.exec(get_focused_workspace, function(focused_ws)
			focused_ws = focused_ws:match("^%s*(.-)%s*$") -- trim whitespace

			for ws, space in pairs(spaces) do
				local is_selected = (ws == focused_ws)
				space_selected[ws] = is_selected
				update_space_display(space, ws, is_selected, space_contains_front_app[ws], space_has_windows[ws])
			end
		end)
	end)
end

-- Build spaces for workspaces 1-10
for i = 1, 10 do
	local ws = tostring(i)

	local space = sbar.add("item", "space." .. ws, {
		icon = {
			font = { size = 13, family = fonts.font.text, style = fonts.font.style_map["Bold"] },
			string = ws,
			padding_left = 2,
			padding_right = 2,
			color = colors.grey,
			highlight_color = colors.white,
		},
		label = {
			padding_right = 2,
			padding_left = 2,
			color = colors.grey,
			highlight_color = colors.white,
			font = "sketchybar-app-font:Regular:11.0",
		},
		padding_right = 1,
		padding_left = 1,
		background = {
			color = 0x00000000,
			height = 26,
		},
	})
	spaces[ws] = space

	local space_bracket = sbar.add("bracket", { space.name }, {
		background = {
			color = colors.transparent,
			border_color = colors.transparent,
			height = 26,
			border_width = 0,
		},
	})

	-- Subscribe bracket to click events too
	space_bracket:subscribe("mouse.clicked", function(env)
		sbar.exec("aerospace workspace " .. ws)
	end)

	local space_padding = sbar.add("item", "space.padding." .. ws, {
		width = 2,
		padding_left = 5,
		padding_right = 5,
	})
	space_paddings[ws] = space_padding

	local space_popup = sbar.add("item", {
		position = "popup." .. space.name,
		padding_left = 2,
		padding_right = 2,
		background = {
			border_color = colors.dnd,
			border_width = 1,
			drawing = true,
			image = {
				corner_radius = 8,
				scale = 0.3,
			},
		},
	})

	-- Subscribe to aerospace workspace changes
	space:subscribe("aerospace_workspace_change", function(env)
		local focused_workspace = env.FOCUSED_WORKSPACE
		local is_selected = (focused_workspace == ws)
		space_selected[ws] = is_selected

		-- Update bracket border
		space_bracket:set({
			background = {
				drawing = false,
			},
		})

		-- Update that space's display
		update_space_display(space, ws, is_selected, space_contains_front_app[ws], space_has_windows[ws])
	end)

	-- Click handling
	space:subscribe("mouse.clicked", function(env)
		if env.BUTTON == "other" then
			space_popup:set({ background = { image = "space." .. ws } })
			space:set({ popup = { drawing = "toggle" } })
		elseif env.BUTTON == "right" then
			-- Right click could destroy workspace in yabai, but aerospace doesn't support this
			sbar.exec("aerospace workspace " .. ws)
		else
			sbar.exec("aerospace workspace " .. ws)
		end
	end)

	space:subscribe("mouse.exited", function(_)
		space:set({ popup = { drawing = false } })
	end)
end

-- Listen for front app changes
local front_app_listener = sbar.add("item", { drawing = false })
front_app_listener:subscribe("front_app_switched", function(env)
	current_front_app = env.INFO

	-- Re-evaluate which spaces contain that front app
	for ws, appset in pairs(space_app_names) do
		local has = false
		if current_front_app and appset[current_front_app] then
			has = true
		end
		space_contains_front_app[ws] = has
	end

	-- Update visuals for all spaces
	for ws, space in pairs(spaces) do
		update_space_display(space, ws, space_selected[ws], space_contains_front_app[ws], space_has_windows[ws])
	end

	-- Also refresh windows in case apps moved
	update_windows()
end)

-- Root item to handle global event subscriptions
local root = sbar.add("item", { drawing = false, updates = true })

root:subscribe("aerospace_workspace_change", function()
	update_windows()
end)

root:subscribe("window_focus", function()
	update_windows()
end)

root:subscribe("space_windows_change", function()
	update_windows()
end)

root:subscribe("display_change", function()
	update_windows()
end)

root:subscribe("system_woke", function()
	update_windows()
end)

-- Initial update
update_windows()

-- sbar.add("item", "divider2", {
-- 	icon = {
-- 		font = { family = settings.default, size = 12 },
-- 		string = "│",
-- 		drawing = true,
-- 		color = colors.white,
-- 	},
-- 	padding_left = -2,
-- 	padding_right = 0,
-- 	position = "left",
-- })
