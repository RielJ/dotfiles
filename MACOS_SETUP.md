# macOS Linux-Style Setup Guide

This guide documents the manual setup steps required after configuring Karabiner and AeroSpace for a Linux Sway-like experience on macOS.

## Overview

This setup transforms your macOS keybindings to match Linux:

| macOS Key | Behaves Like (Linux) | Purpose |
|-----------|----------------------|---------|
| Control | Control | Same behavior |
| Command | Alt | App shortcuts, special characters |
| Option | Super/Windows | Window manager modifier (AeroSpace) |

---

## Manual Setup Steps

### 1. Grant AeroSpace Accessibility Permissions

AeroSpace requires accessibility permissions to manage windows.

1. Open **System Settings**
2. Go to **Privacy & Security** → **Accessibility**
3. Find **AeroSpace** in the list
4. Toggle it **ON**

If AeroSpace doesn't appear in the list, try launching it first:
```bash
open -a AeroSpace
```

### 2. Configure Raycast Hotkey

Set up Raycast to respond to `Option+D` (like `Super+D` for wofi in Sway).

1. Open **Raycast**
2. Go to **Settings** (Cmd+,) → **General**
3. Set **Raycast Hotkey** to `Option+D`

### 3. Configure Screenshot Shortcuts (Optional)

To match Sway's screenshot behavior, configure macOS screenshot shortcuts:

1. Open **System Settings**
2. Go to **Keyboard** → **Keyboard Shortcuts** → **Screenshots**
3. Recommended mappings:
   - **Screenshot area to clipboard**: `Option+Shift+S` (like `$mod+Shift+s` in Sway)
   - **Screenshot screen to clipboard**: `Option+Shift+3`
   - **Screenshot area to file**: `Option+Ctrl+S`

### 4. Disable macOS "Displays have separate Spaces" (Recommended)

This improves multi-monitor support with AeroSpace.

**Option A: Via System Settings**
1. Open **System Settings**
2. Go to **Desktop & Dock** → **Mission Control**
3. Disable **"Displays have separate Spaces"**
4. Log out and log back in

**Option B: Via Terminal**
```bash
defaults write com.apple.spaces spans-displays -bool true && killall SystemUIServer
```
Then log out and log back in.

### 5. Enable Window Dragging Gesture (Optional)

This allows you to drag windows by holding `Ctrl+Cmd` and clicking anywhere on the window (similar to Linux behavior with Super+drag).

```bash
defaults write -g NSWindowShouldDragOnGesture -bool true
```

### 6. Hide macOS Menu Bar (Optional)

To get a cleaner look with just SketchyBar:

1. Open **System Settings**
2. Go to **Control Center** → **Automatically hide and show the menu bar**
3. Set to **Always**

---

## SketchyBar (Status Bar)

SketchyBar replaces Waybar on macOS. It displays:

**Left:** Workspaces (1-10) | Window Title  
**Center:** Clock | Media Player  
**Right:** Volume | CPU | Memory | Network | Battery | Power Menu

### SketchyBar Commands

```bash
# Start SketchyBar
brew services start sketchybar

# Stop SketchyBar
brew services stop sketchybar

# Restart SketchyBar
brew services restart sketchybar

# Reload configuration (without restart)
sketchybar --reload

# Force update all items
sketchybar --update
```

### SketchyBar Click Actions

| Item | Click Action |
|------|--------------|
| Workspace | Switch to that workspace |
| CPU/Memory | Open Activity Monitor |
| Network | Open WiFi Settings |
| Media | Play/Pause |
| Power | Power menu dialog |

---

## Keybinding Reference

### Window Management (Option = Super)

| Shortcut | Action |
|----------|--------|
| `Option+h/j/k/l` | Focus left/down/up/right |
| `Option+Shift+h/j/k/l` | Move window left/down/up/right |
| `Option+1-0` | Switch to workspace 1-10 |
| `Option+Shift+1-0` | Move window to workspace 1-10 |
| `Option+Tab` | Next workspace |
| `Option+Shift+Tab` | Previous workspace |
| `Option+Enter` | Open kitty terminal |
| `Option+D` | Open Raycast (app launcher) |
| `Option+Shift+Q` | Close window |
| `Option+F` | Toggle fullscreen |
| `Option+Shift+Space` | Toggle floating/tiling |
| `Option+B` | Join with window on left |
| `Option+V` | Join with window below |
| `Option+S` | Accordion layout (horizontal) |
| `Option+W` | Accordion layout (vertical) |
| `Option+E` | Toggle tiles layout |
| `Option+A` | Focus back and forth |
| `Option+R` | Enter resize mode |
| `Option+Shift+C` | Reload AeroSpace config |
| `Option+=` | Balance window sizes |

### Resize Mode (after pressing Option+R)

| Shortcut | Action |
|----------|--------|
| `h` / `Left` | Shrink width |
| `l` / `Right` | Grow width |
| `k` / `Up` | Shrink height |
| `j` / `Down` | Grow height |
| `Enter` / `Esc` / `Option+R` | Exit resize mode |

### App Shortcuts (Ctrl = Linux Ctrl)

| Shortcut | Action |
|----------|--------|
| `Ctrl+C` | Copy (GUI apps) |
| `Ctrl+V` | Paste (GUI apps) |
| `Ctrl+X` | Cut |
| `Ctrl+A` | Select All |
| `Ctrl+Z` | Undo |
| `Ctrl+Shift+Z` | Redo |
| `Ctrl+S` | Save |
| `Ctrl+W` | Close Tab/Window |
| `Ctrl+T` | New Tab |
| `Ctrl+Shift+T` | Reopen closed tab |
| `Ctrl+N` | New Window |
| `Ctrl+F` | Find |
| `Ctrl+G` | Find Next |
| `Ctrl+Shift+G` | Find Previous |
| `Ctrl+Q` | Quit App |
| `Ctrl+R` | Reload |
| `Ctrl+L` | Address Bar (browsers) |
| `Ctrl+P` | Print |
| `Ctrl+O` | Open |
| `Ctrl+K` | App-specific |
| `Ctrl+B/I/U` | Bold/Italic/Underline |
| `Ctrl+/` | Comment (IDEs) |

### Terminal (kitty) Shortcuts

| Shortcut | Action |
|----------|--------|
| `Ctrl+C` | SIGINT (interrupt) |
| `Ctrl+D` | EOF |
| `Ctrl+Z` | SIGTSTP (suspend) |
| `Ctrl+L` | Clear screen |
| `Ctrl+Shift+C` | Copy |
| `Ctrl+Shift+V` | Paste |

---

## Disabled macOS Shortcuts

The following macOS shortcuts have been disabled to prevent conflicts:

| Shortcut | Original Action |
|----------|-----------------|
| `Cmd+H` | Hide window |
| `Cmd+M` | Minimize window |
| `Cmd+Tab` | App switcher |
| `Cmd+Option+H` | Hide others |
| `Cmd+Option+M` | Minimize all |

---

## Troubleshooting

### AeroSpace not responding to shortcuts
1. Ensure AeroSpace has accessibility permissions
2. Check if AeroSpace is running (look for icon in menu bar)
3. Try reloading config: `aerospace reload-config`

### Karabiner remappings not working
1. Open Karabiner-Elements
2. Ensure "Linux Keybinding" profile is selected
3. Check that rules are enabled (not grayed out)

### Ctrl+C not copying in apps
1. This is expected in terminal apps (kitty)
2. Use `Ctrl+Shift+C` in kitty terminal
3. In other apps, Ctrl+C should work

### Some shortcuts conflict with specific apps
You can add app-specific exceptions in Karabiner. Edit:
`~/.config/karabiner/karabiner.json`

Add the app's bundle identifier to the `frontmost_application_unless` condition.

---

## Configuration Files

| File | Purpose |
|------|---------|
| `~/.config/karabiner/karabiner.json` | Karabiner key remappings |
| `~/.aerospace.toml` | AeroSpace window manager config |
| `~/.config/sketchybar/sketchybarrc` | SketchyBar main config |
| `~/.config/sketchybar/colors.sh` | SketchyBar color definitions |
| `~/.config/sketchybar/items/` | SketchyBar item configurations |
| `~/.config/sketchybar/plugins/` | SketchyBar plugin scripts |

All files are symlinked from `~/dotfiles/` and managed with GNU Stow.

---

## Useful Commands

```bash
# Reload AeroSpace config
aerospace reload-config

# List all windows
aerospace list-windows --all

# List workspaces
aerospace list-workspaces --all

# Check AeroSpace version
aerospace --version

# Reload SketchyBar
sketchybar --reload

# Restart SketchyBar
brew services restart sketchybar

# Open Karabiner Elements
open -a "Karabiner-Elements"

# Open Karabiner Event Viewer (for debugging)
open -a "Karabiner-EventViewer"
```

---

## Credits

This setup replicates the Sway window manager experience from Arch Linux on macOS using:
- [Karabiner-Elements](https://karabiner-elements.pqrs.org/) - Keyboard remapping
- [AeroSpace](https://github.com/nikitabobko/AeroSpace) - Tiling window manager
- [SketchyBar](https://github.com/FelixKratz/SketchyBar) - Status bar (replacing Waybar)
- [Raycast](https://www.raycast.com/) - App launcher (replacing wofi)
