#!/bin/bash

workspaces=($(aerospace list-workspaces --monitor focused --empty no))
current=$(aerospace list-workspaces --focused)
for i in "${!workspaces[@]}"; do
    if [[ "${workspaces[$i]}" == "$current" ]]; then
        prev_index=$(( (i - 1 + ${#workspaces[@]}) % ${#workspaces[@]} ))
        aerospace workspace --fail-if-noop "${workspaces[$prev_index]}"
        exit 0
    fi
done
