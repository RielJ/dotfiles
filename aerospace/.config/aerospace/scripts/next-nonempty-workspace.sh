#!/bin/bash
# Get non-empty workspaces as an array
workspaces=($(aerospace list-workspaces --monitor focused --empty no))
current=$(aerospace list-workspaces --focused)

# If no non-empty workspaces, do nothing
[[ ${#workspaces[@]} -eq 0 ]] && exit 0

# Find current index and get next
for i in "${!workspaces[@]}"; do
    if [[ "${workspaces[$i]}" == "$current" ]]; then
        next_index=$(( (i + 1) % ${#workspaces[@]} ))  # wrap-around
        aerospace workspace --fail-if-noop "${workspaces[$next_index]}"
        exit 0
    fi
done

# Current workspace is empty (not in list), find next non-empty workspace
for ws in "${workspaces[@]}"; do
    if [[ "$ws" -gt "$current" ]]; then
        aerospace workspace "$ws"
        exit 0
    fi
done

# No higher workspace found, wrap to first
aerospace workspace "${workspaces[0]}"
