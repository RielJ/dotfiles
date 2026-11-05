#!/usr/bin/env bash
# Link zen/user.js into the Zen profile that Zen opens by default.
#
# Zen names profile folders randomly, so stow can't target them. This reads the
# default profile from profiles.ini and symlinks user.js into it. Zen applies
# user.js on every start, so restart Zen after running this.
#
#   ./scripts/zen-link.sh
set -euo pipefail

src="$(cd "$(dirname "$0")/.." && pwd)/zen/user.js"
zen_dir="$HOME/Library/Application Support/zen"
ini="$zen_dir/profiles.ini"

if [[ ! -f "$ini" ]]; then
  echo "No $ini. Open Zen once to create a profile, then run this again." >&2
  exit 1
fi

# The [Install...] section holds the profile Zen actually opens.
profile="$(awk -F= '/^\[Install/{s=1; next} /^\[/{s=0} s && $1=="Default"{print $2; exit}' "$ini")"
if [[ -z "$profile" ]]; then
  echo "No default profile in $ini." >&2
  exit 1
fi

dest="$zen_dir/$profile/user.js"
if [[ -e "$dest" && ! -L "$dest" ]]; then
  backup="$dest.bak-$(date +%Y%m%d-%H%M%S)"
  mv "$dest" "$backup"
  echo "Moved existing user.js to $backup"
fi

ln -sfn "$src" "$dest"
echo "Linked $dest -> $src"
