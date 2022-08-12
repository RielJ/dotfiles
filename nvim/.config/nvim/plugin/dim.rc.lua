local status_ok, dim = pcall(require, "dim")
if not status_ok then
  return
end

dim.setup {}
