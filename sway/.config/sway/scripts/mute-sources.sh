#!/bin/sh
notify=

while [ $# -gt 0 ]; do
	case $1 in
	--notify) notify=1 ;;
	*) true ;;
	esac

	shift
done

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
			pamixer --source "$index" -u
		else
			pamixer --source "$index" -m
		fi

		if [ "$notify" ]; then
			notify-send --hint=int:transient:1 "Mic Toggle" "Toggled"
		fi
	done
