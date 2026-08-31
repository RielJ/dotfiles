#!/usr/bin/env bash
# Configure macOS screenshot hotkeys (com.apple.symbolichotkeys).
#
# Modifier mask values: shift=131072 control=262144 option=524288 command=1048576
# Hotkey ids: 28=screen->file 29=screen->clipboard 30=area->file
#             31=area->clipboard 184=screenshot/recording options
set -euo pipefail

# 184: screenshot & recording options (default Cmd+Shift+5) -> DISABLED
defaults write com.apple.symbolichotkeys AppleSymbolicHotKeys -dict-add 184 \
  '<dict><key>enabled</key><false/><key>value</key><dict><key>parameters</key><array><integer>53</integer><integer>23</integer><integer>1179648</integer></array><key>type</key><string>standard</string></dict></dict>'

# 31: copy picture of selected area to clipboard -> Ctrl+Shift+S (262144+131072=393216)
defaults write com.apple.symbolichotkeys AppleSymbolicHotKeys -dict-add 31 \
  '<dict><key>enabled</key><true/><key>value</key><dict><key>parameters</key><array><integer>115</integer><integer>1</integer><integer>393216</integer></array><key>type</key><string>standard</string></dict></dict>'

/System/Library/PrivateFrameworks/SystemAdministration.framework/Resources/activateSettings -u
echo "Screenshot hotkeys applied. Ctrl+Shift+S = region select -> clipboard; Cmd+Shift+5 disabled."
