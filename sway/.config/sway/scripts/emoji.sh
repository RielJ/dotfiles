#!/bin/bash

# Determine which output is currently active (where the mouse pointer is). 🤔
MONITOR_ID=$(swaymsg -t get_outputs | jq '[.[].focused] | index(true)')

# Let's pick our emojis! 🎉
rofimoji --action clipboard --skin-tone moderate --selector-args="-monitor ${MONITOR_ID}"
