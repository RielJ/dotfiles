local status, neoclip = pcall(require, "neoclip")
if not status then
  print "Trouble is not installed"
  return
end

neoclip.setup {}
