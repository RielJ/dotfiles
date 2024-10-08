#!/usr/bin/env bash
set -x

geometry() {
	windowGeometries=$(
		# `height - 1` is there because of: https://github.com/ammen99/wf-recorder/pull/56 (I could remove it if it's merged, maybe)
		swaymsg -t get_workspaces -r | jq -r '.[] | select(.focused) | .rect | "\(.x),\(.y) \(.width)x\(.height - 1)"'
		swaymsg -t get_outputs -r | jq -r '.[] | select(.active) | .rect | "\(.x),\(.y) \(.width)x\(.height)"'
	)
	geometry=$(slurp -b "#45858820" -c "#45858880" -w 3 -d <<<"$windowGeometries") || exit $?
	echo $geometry
}

# Ensure we're not using the wayland backend on SDL
unset SDL_VIDEODRIVER

geometry=$(geometry) || exit $?
# wf-recorder -c rawvideo --geometry="$geometry" -m sdl -f pipe:wayland-mirror

# wf-recorder --geometry="$geometry" -f ~/Videos/screencast/$(date +'recording_%Y-%m-%d-%H%M%S.mp4') --audio="alsa_card.usb-Schiit_Audio_Schiit_Modi_3_-00"
wf-recorder --geometry="$geometry" -f ~/Videos/screencast/$(date +'recording_%Y-%m-%d-%H%M%S.mp4') --audio="alsa_card.pci-0000_00_1f.3"
# Alternative method via ffplay
# wf-recorder -c rawvideo --geometry="$geometry" -x yuv420p -m avi -f pipe:99 99>&1 >&2 | ffplay -f avi - &
