local filepath, line = ...
local bufnr = vim.fn.bufadd(filepath)
vim.fn.bufload(bufnr)

local ok, parser = pcall(vim.treesitter.get_parser, bufnr)
if not ok or not parser then
  return { { type = "error", name = "No treesitter parser for this file", line = 0 } }
end

parser:parse()
local node = vim.treesitter.get_node({ bufnr = bufnr, pos = { line - 1, 0 } })
if not node then
  return { { type = "error", name = "No AST node at this position", line = 0 } }
end

local chain = {}
local current = node ---@type TSNode?
while current do
  local name_node = current:field("name")[1]
  local name = name_node and vim.treesitter.get_node_text(name_node, bufnr) or vim.NIL
  table.insert(chain, 1, { type = current:type(), name = name, line = current:start() + 1 })
  current = current:parent()
end
return chain
