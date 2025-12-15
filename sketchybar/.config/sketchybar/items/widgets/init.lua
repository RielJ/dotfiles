-- Widgets loaded in order (rightmost first for sketchybar right positioning)
-- Layout: ... | media | volume | cpu | memory | wifi | battery | calendar (rightmost)

require("items.widgets.date_time") -- Date/Time (leftmost)
-- require("items.widgets.calendar") -- Clock (rightmost)
require("items.widgets.battery") -- Battery
require("items.widgets.wifi") -- WiFi
require("items.widgets.memory") -- Memory
require("items.widgets.cpu") -- CPU
require("items.widgets.volume") -- Volume
require("items.widgets.media") -- Media (leftmost of right widgets)
