#!/bin/sh
notify=1

if ! command -v pamixer >/dev/null; then
	exit_code="$?"

	if [ "$notify" ]; then
		notify-send \
			--hint=int:transient:1 \
			"Error" \
			"'pamixer' is not available."
	fi

	exit $exit_code
fi

pamixer --list-sources |
	grep input |
	awk '{print $1}' |
	while read -r index; do
		mic_muted="$(pamixer --source "$index" --get-mute)"

		 if [ "$mic_muted" = "true" ]; then
		 	notify-send -t 5000 "Mic" "Microphone Deactivated"
		# 	pamixer --source "$index" -u
		 else
		# 	pamixer --source "$index" -m
		 	notify-send -t 5000 "Mic" "Microphone Activated"
		 fi

		# if [ "$notify" ]; then
		# 	notify-send --hint=int:transient:1 "Mic Toggle" "Toggled"
		# fi
	done

