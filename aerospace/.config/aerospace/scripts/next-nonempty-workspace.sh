#!/bin/bash
# Get non-empty workspaces as an array
workspaces=($(aerospace list-workspaces --monitor focused --empty no))
current=$(aerospace list-workspaces --focused)
# Find current index and get next
for i in "${!workspaces[@]}"; do
    if [[ "${workspaces[$i]}" == "$current" ]]; then
        next_index=$(( (i + 1) % ${#workspaces[@]} ))  # wrap-around
        aerospace workspace --fail-if-noop "${workspaces[$next_index]}"
        exit 0
    fi
done
