local icons = {
	-- NerdFont icons (matching waybar style)
	nerdfont = {
		plus = "",
		loading = "",
		apple = "",
		gear = "",
		cpu = "",
		memory = "", -- nf-fa-memory
		clipboard = "",
		calendar = "", -- nf-fa-calendar
		clock = "", -- nf-fa-clock

		switch = {
			on = "󱨥",
			off = "󱨦",
		},
		volume = {
			_100 = "",
			_66 = "",
			_33 = "",
			_10 = "",
			_0 = "",
		},
		battery = {
			_100 = "",
			_75 = "",
			_50 = "",
			_25 = "",
			_0 = "",
			charging = "",
		},
		wifi = {
			upload = "",
			download = "",
			connected = "󰖩",
			disconnected = "󰖪",
			router = "Missing Icon",
		},
		media = {
			back = "󰒮", -- nf-md-skip_previous
			forward = "󰒭", -- nf-md-skip_next
			play_pause = "󰐎", -- nf-md-play_pause
			play = "", -- nf-fa-play
			pause = "", -- nf-fa-pause
		},
	},
}

return icons.nerdfont
