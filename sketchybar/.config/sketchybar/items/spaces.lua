local appearance = require("appearance")
local sbar = require("sketchybar")
local fonts = require("fonts")

local colors = appearance.colors

local query_workspaces =
	"aerospace list-workspaces --all --format '%{workspace}%{monitor-appkit-nsscreen-screens-id}' --json"

-- Root is used to handle event subscriptions
local root = sbar.add("item", { drawing = false })
local workspaces = {}

local function withWindows(f)
	local open_windows = {}
	local get_windows = "aerospace list-windows --monitor all --format '%{workspace}%{app-name}%{window-id}' --json"
	local query_visible_workspaces =
		"aerospace list-workspaces --visible --monitor all --format '%{workspace}%{monitor-appkit-nsscreen-screens-id}' --json"
	local get_focus_workspaces = "aerospace list-workspaces --focused"
	sbar.exec(get_windows, function(workspace_and_windows)
		local processed_windows = {}

		for _, entry in ipairs(workspace_and_windows) do
			local workspace_index = entry.workspace
			local app = entry["app-name"]
			local window_id = entry["window-id"]

			if not processed_windows[window_id] then
				processed_windows[window_id] = true

				if open_windows[workspace_index] == nil then
					open_windows[workspace_index] = {}
				end

				local app_exists = false
				for _, existing_app in ipairs(open_windows[workspace_index]) do
					if existing_app == app then
						app_exists = true
						break
					end
				end

				if not app_exists then
					table.insert(open_windows[workspace_index], app)
				end
			end
		end

		sbar.exec(get_focus_workspaces, function(focused_workspaces)
			sbar.exec(query_visible_workspaces, function(visible_workspaces)
				local args = {
					open_windows = open_windows,
					focused_workspaces = focused_workspaces,
					visible_workspaces = visible_workspaces,
				}
				f(args)
			end)
		end)
	end)
end

local function updateWindow(workspace_index, args)
	local open_windows = args.open_windows[workspace_index]
	local focused_workspaces = args.focused_workspaces
	local visible_workspaces = args.visible_workspaces

	if open_windows == nil then
		open_windows = {}
	end

	local has_windows = #open_windows > 0

	sbar.animate("tanh", 10, function()
		-- Check if this workspace is visible (has monitor assigned)
		for _, visible_workspace in ipairs(visible_workspaces) do
			if workspace_index == visible_workspace["workspace"] then
				local monitor_id = visible_workspace["monitor-appkit-nsscreen-screens-id"]
				workspaces[workspace_index]:set({
					drawing = true,
					display = monitor_id,
				})
				return
			end
		end

		-- Hide empty workspaces that aren't focused
		if not has_windows and workspace_index ~= focused_workspaces then
			workspaces[workspace_index]:set({
				drawing = false,
			})
			return
		end

		-- Show focused workspace even if empty
		if workspace_index == focused_workspaces then
			workspaces[workspace_index]:set({
				drawing = true,
			})
		end

		-- Show workspaces with windows
		if has_windows then
			workspaces[workspace_index]:set({
				drawing = true,
			})
		end
	end)
end

local function updateWindows()
	withWindows(function(args)
		for workspace_index, _ in pairs(workspaces) do
			updateWindow(workspace_index, args)
		end
	end)
end

local function updateWorkspaceMonitor()
	local workspace_monitor = {}
	sbar.exec(query_workspaces, function(workspaces_and_monitors)
		for _, entry in ipairs(workspaces_and_monitors) do
			local space_index = entry.workspace
			local monitor_id = math.floor(entry["monitor-appkit-nsscreen-screens-id"])
			workspace_monitor[space_index] = monitor_id
		end
		for workspace_index, _ in pairs(workspaces) do
			workspaces[workspace_index]:set({
				display = workspace_monitor[workspace_index],
			})
		end
	end)
end

sbar.exec(query_workspaces, function(workspaces_and_monitors)
	for _, entry in ipairs(workspaces_and_monitors) do
		local workspace_index = entry.workspace

		local workspace = sbar.add("item", "workspace." .. workspace_index, {
			background = {
				color = colors.transparent,
				drawing = false,
			},
			click_script = "aerospace workspace " .. workspace_index,
			drawing = false,
			padding_left = 4,
			padding_right = 4,
			icon = {
				color = colors.active.overlay1,
				highlight_color = colors.active.peach,
				font = {
					family = fonts.font.text,
					style = fonts.font.style_map["Bold"],
					size = 13.0,
				},
				padding_left = 4,
				padding_right = 4,
				drawing = true,
				string = workspace_index,
			},
			label = {
				drawing = false,
			},
		})

		workspaces[workspace_index] = workspace

		workspace:subscribe("aerospace_workspace_change", function(env)
			local focused_workspace = env.FOCUSED_WORKSPACE
			local is_focused = focused_workspace == workspace_index

			sbar.animate("tanh", 10, function()
				workspace:set({
					icon = { highlight = is_focused },
				})
			end)
		end)
	end

	-- Initial setup
	updateWindows()
	updateWorkspaceMonitor()

	root:subscribe("aerospace_workspace_change", function()
		updateWindows()
	end)

	root:subscribe("front_app_switched", function()
		updateWindows()
	end)

	root:subscribe("display_change", function()
		updateWorkspaceMonitor()
		updateWindows()
	end)

	sbar.exec("aerospace list-workspaces --focused", function(focused_workspace)
		focused_workspace = focused_workspace:match("^%s*(.-)%s*$")
		if workspaces[focused_workspace] then
			workspaces[focused_workspace]:set({
				icon = { highlight = true },
			})
		end
	end)
end)
