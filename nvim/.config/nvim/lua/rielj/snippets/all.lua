local ls = require "luasnip"

local s = ls.s
local i = ls.i
local t = ls.t
local fmt = require("luasnip.extras.fmt").fmt

local same = require("rielj.luasnip").same

return {
  s("trig", t "loaded!!"),
  s("trig1", fmt("test{}", i(1))),
  s("example", fmt("test{}test{}", { i(1), same(1) })),
}
