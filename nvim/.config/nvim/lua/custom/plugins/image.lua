-- Preview images inside Neovim. Opening a .png/.jpg/.jpeg/.gif/.webp/.avif
-- file shows the image instead of its bytes.
--
-- Kitty draws the image with its graphics protocol; tmux forwards it because
-- `allow-passthrough all` is set. ImageMagick's CLI (`magick`) resizes it, so
-- no luarock build is needed.
--
-- LeetCode (leetcode.lua) lists this plugin as a dependency and uses the same
-- settings for problem images.
local image_patterns = { "*.png", "*.jpg", "*.jpeg", "*.gif", "*.webp", "*.avif" }

local load_events = {}
for _, pattern in ipairs(image_patterns) do
  table.insert(load_events, "BufReadPre " .. pattern)
end

return {
  "3rd/image.nvim",
  build = false,
  -- Load on the first image file. The plugin hooks BufWinEnter, which fires
  -- after BufReadPre, so the first image is shown too.
  event = load_events,
  opts = {
    backend = "kitty",
    processor = "magick_cli",
    hijack_file_patterns = image_patterns,
    -- Only preview image files. Inline rendering in markdown and similar
    -- buffers stays off; render-markdown handles those.
    integrations = {
      markdown = { enabled = false },
      asciidoc = { enabled = false },
      typst = { enabled = false },
      neorg = { enabled = false },
      syslang = { enabled = false },
    },
    -- Kitty draws images above the text grid, so floating windows such as
    -- lazygit or the LeetCode console do not cover them. Hide images in any
    -- window that a float overlaps.
    window_overlap_clear_enabled = true,
    -- smear-cursor keeps hidden floating windows open, and image.nvim counts
    -- them as overlaps, which would keep images hidden forever.
    window_overlap_clear_ft_ignore = {
      "cmp_menu",
      "cmp_docs",
      "snacks_notif",
      "scrollview",
      "scrollview_sign",
      "smear-cursor",
    },
    -- Kitty images sit above tmux's text grid. Clear them whenever Neovim
    -- loses focus so they cannot bleed into another pane or window.
    editor_only_render_when_focused = true,
    tmux_show_only_in_active_window = true,
  },
}
