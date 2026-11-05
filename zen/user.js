// Memory tuning for Zen on macOS. Applied on every startup; overrides prefs.js.
// Remove a line (and reset it in about:config) to undo it.

// Zen 1.12.9b replaced its timed tab unloader with Firefox's, which only runs when the
// memory watcher asks. Release builds ship the mask as 0, so on macOS it never asks and
// idle tabs are never unloaded. https://github.com/zen-browser/desktop/issues/15619
user_pref("browser.lowMemoryResponseMask", 3);       // bit 0x1 = unload tabs, 0x2 = GC/minimize
user_pref("browser.lowMemoryResponseOnWarn", true);  // act at "warn" pressure, not only "critical"
user_pref("browser.tabs.unloadOnLowMemory", true);
user_pref("browser.tabs.min_inactive_duration_before_unload", 600000); // 10 min idle before eligible

// Back/forward cache keeps whole pages in RAM per tab (auto = up to 8 on 32 GB).
// 2 keeps instant Back for the last couple of pages.
user_pref("browser.sessionhistory.max_total_viewers", 2);

// Write the session file every 60 s instead of 40 s (fewer disk writes with 60 tabs).
user_pref("browser.sessionstore.interval", 60000);

// Local AI engine (smart tab groups, link previews). Runs a separate inference process
// with a model in RAM. Zen ships it off; this profile had it switched on.
user_pref("browser.ml.enable", false);
user_pref("browser.tabs.groups.smart.enabled", false);

// Fastfox (Betterfox v148, github.com/yokoffing/Betterfox/blob/main/Fastfox.js).
// Zen does not set these; values and comments are Betterfox's.
user_pref("gfx.content.skia-font-cache-size", 20);              // MB; default 5
user_pref("content.notify.interval", 100000);                   // 0.10 s; default 0.12 s
user_pref("image.mem.decode_bytes_at_a_time", 32768);           // default 16384
user_pref("network.buffer.cache.size", 65535);                  // default 32768
user_pref("network.buffer.cache.count", 48);                    // default 24
user_pref("network.http.max-connections", 1800);                // default 900
user_pref("network.http.max-persistent-connections-per-server", 10); // default 6
user_pref("network.http.request.max-start-delay", 5);           // default 10
user_pref("network.dnsCacheExpiration", 3600);                  // 1 h; default 60 s
