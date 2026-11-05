#!/usr/bin/env bash
# Install the global npm packages in node/globals.txt into fnm's default Node.
#
# fnm keeps globals per Node version, so run this after switching versions:
#   fnm install 24 && fnm default 24 && ./scripts/node-globals.sh
set -euo pipefail

manifest="$(cd "$(dirname "$0")/.." && pwd)/node/globals.txt"

eval "$(fnm env --shell bash)"
fnm use default >/dev/null
echo "Installing globals into $(node -v) at $(npm config get prefix)"

packages=()
allow=""
while read -r line; do
  line="${line%%#*}"
  line="$(echo "$line" | xargs)"
  [[ -z "$line" ]] && continue
  if [[ "$line" == allow-scripts:* ]]; then
    allow="$(echo "${line#allow-scripts:}" | xargs)"
  else
    packages+=("$line")
  fi
done <"$manifest"

# --ignore-scripts=false overrides ~/.npmrc; --allow-scripts then limits
# install scripts to the reviewed list.
npm install --global --ignore-scripts=false --allow-scripts="$allow" "${packages[@]}"

npm ls --global --depth=0
