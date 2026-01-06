#!/bin/bash

workspaces=($(aerospace list-workspaces --monitor focused --empty no))
current=$(aerospace list-workspaces --focused)

# If no non-empty workspaces, do nothing
[[ ${#workspaces[@]} -eq 0 ]] && exit 0

for i in "${!workspaces[@]}"; do
    if [[ "${workspaces[$i]}" == "$current" ]]; then
        prev_index=$(( (i - 1 + ${#workspaces[@]}) % ${#workspaces[@]} ))
        aerospace workspace --fail-if-noop "${workspaces[$prev_index]}"
        exit 0
    fi
done

# Current workspace is empty (not in list), find previous non-empty workspace
for (( i=${#workspaces[@]}-1; i>=0; i-- )); do
    if [[ "${workspaces[$i]}" -lt "$current" ]]; then
        aerospace workspace "${workspaces[$i]}"
        exit 0
    fi
done

# No lower workspace found, wrap to last
aerospace workspace "${workspaces[-1]}"
