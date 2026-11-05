# Zen browser

`user.js` holds memory and speed settings for Zen on macOS. Zen applies it on every start, and its values override anything changed in `about:config`.

## Install

```sh
./scripts/zen-link.sh
```

The script symlinks `user.js` into the profile Zen opens by default. Quit Zen with Cmd+Q and open it again to apply the settings.

To undo a setting, delete its line from `user.js` and reset the setting in `about:config`.

## Mods

Zen stores mods in the profile, not in `user.js`. Install these from Settings → Zen Mods:

| Mod | Source |
|---|---|
| Better Active Tab | https://github.com/HliasOuzounis/zen-browser-better-active-tab-indicator |
| Better Unloaded Tabs | https://github.com/Felkazz/zen-browser-better-unloaded-tabs |
| Bottom Essentials | https://github.com/TheBigWazz/ZenThemes/tree/main/Bottom-Essentials |
| Disable Status Bar | Zen mod store |
| Pimp your PiP | Zen mod store |
| Revitalized devtools | https://github.com/ArjiAmin/firefox-devtools |

Avoid Transparent Zen and other mods that use `backdrop-filter`. Blur makes macOS redraw the window more often.
