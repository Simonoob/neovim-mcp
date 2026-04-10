local filepath = select(1, ...)
local bufnr = vim.fn.bufadd(filepath)
vim.fn.bufload(bufnr)

local ok, parser = pcall(vim.treesitter.get_parser, bufnr)
if not ok or not parser then
  return {
    {
      kind = "error",
      name = "No treesitter parser for this file",
      line = 0,
      end_line = 0,
      signature = "",
      children = {},
    },
  }
end

local tree = parser:parse()[1]
if not tree then
  return { { kind = "error", name = "Failed to parse file", line = 0, end_line = 0, signature = "", children = {} } }
end

local kinds = {
  function_declaration = "function",
  function_definition = "function",
  method_definition = "function",
  method_declaration = "function",
  arrow_function = "function",
  function_item = "function",
  function_statement = "function",
  class_declaration = "class",
  class_definition = "class",
  interface_declaration = "interface",
  type_alias_declaration = "type",
  enum_declaration = "enum",
  struct_item = "struct",
  enum_item = "enum",
  impl_item = "impl",
  trait_item = "trait",
  module_declaration = "module",
}

local function get_name(node)
  local n = node:child_by_field_name("name")
  if n then
    return vim.treesitter.get_node_text(n, bufnr)
  end
  if node:type() == "arrow_function" then
    local p = node:parent()
    if p and p:type() == "variable_declarator" then
      n = p:child_by_field_name("name")
      if n then
        return vim.treesitter.get_node_text(n, bufnr)
      end
    end
  end
  return nil
end

local function get_sig(node)
  local row = node:start()
  local lines = vim.api.nvim_buf_get_lines(bufnr, row, row + 1, false)
  if not lines[1] then
    return ""
  end
  local sig = vim.trim(lines[1])
  return #sig > 120 and sig:sub(1, 117) .. "..." or sig
end

local function walk(node, depth, out)
  for child in node:iter_children() do
    local kind = kinds[child:type()]
    if kind then
      local entry = {
        kind = kind,
        name = get_name(child) or "[anonymous]",
        line = child:start() + 1,
        end_line = select(1, child:end_()) + 1,
        signature = get_sig(child),
        children = {},
      }
      table.insert(out, entry)
      walk(child, depth + 1, entry.children)
    elseif depth < 4 then
      walk(child, depth, out)
    end
  end
end

local results = {}
walk(tree:root(), 0, results)
if #results == 0 then
  return {
    { kind = "info", name = "No structural symbols found", line = 0, end_line = 0, signature = "", children = {} },
  }
end
return results
