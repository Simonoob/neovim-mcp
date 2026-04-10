import { NeovimClient } from "../neovim.js";
import { OutlineEntry, formatOutline } from "../formatters.js";

const OUTLINE_LUA = `
local filepath = select(1, ...)

local bufnr = vim.fn.bufadd(filepath)
vim.fn.bufload(bufnr)

-- Try Aerial first (richer symbol data)
local ok, aerial = pcall(require, "aerial")
if ok then
  local symbols = aerial.get_buf_symbol_table(bufnr)
  if symbols and #symbols > 0 then
    local function convert(syms)
      local result = {}
      for _, s in ipairs(syms) do
        table.insert(result, {
          kind = s.kind or "Unknown",
          name = s.name or "[anonymous]",
          line = s.lnum or 0,
          end_line = s.end_lnum or s.lnum or 0,
          signature = "",
          children = s.children and convert(s.children) or {},
        })
      end
      return result
    end
    return convert(symbols)
  end
end

-- Fallback: treesitter walk
local parse_ok, parser = pcall(vim.treesitter.get_parser, bufnr)
if not parse_ok or not parser then
  return {{ kind = "error", name = "No treesitter parser for this file", line = 0, end_line = 0, signature = "", children = {} }}
end

local tree = parser:parse()[1]
if not tree then
  return {{ kind = "error", name = "Failed to parse file", line = 0, end_line = 0, signature = "", children = {} }}
end

local root = tree:root()

local structural_types = {
  -- Functions
  function_declaration = "function",
  function_definition = "function",
  method_definition = "function",
  method_declaration = "function",
  arrow_function = "function",
  function_item = "function",       -- Rust
  function_statement = "function",  -- Lua
  -- Classes
  class_declaration = "class",
  class_definition = "class",
  -- Interfaces / Types
  interface_declaration = "interface",
  type_alias_declaration = "type",
  enum_declaration = "enum",
  struct_item = "struct",           -- Rust
  enum_item = "enum",               -- Rust
  impl_item = "impl",               -- Rust
  trait_item = "trait",              -- Rust
  -- Module-level
  export_statement = "export",
  module_declaration = "module",
}

local function get_name(node)
  local name_node = node:child_by_field_name("name")
  if name_node then
    return vim.treesitter.get_node_text(name_node, bufnr)
  end
  -- For arrow functions assigned to variables, check parent
  if node:type() == "arrow_function" then
    local parent = node:parent()
    if parent and parent:type() == "variable_declarator" then
      local vname = parent:child_by_field_name("name")
      if vname then return vim.treesitter.get_node_text(vname, bufnr) end
    end
  end
  return nil
end

local function get_signature(node)
  local start_row = node:start()
  local lines = vim.api.nvim_buf_get_lines(bufnr, start_row, start_row + 1, false)
  if lines[1] then
    local sig = vim.trim(lines[1])
    -- Truncate long signatures
    if #sig > 120 then sig = sig:sub(1, 117) .. "..." end
    return sig
  end
  return ""
end

local function walk(node, depth, parent_list)
  for child in node:iter_children() do
    local t = child:type()
    local kind = structural_types[t]
    if kind then
      local name = get_name(child) or "[anonymous]"
      local start_line = child:start() + 1
      local end_line = select(1, child:end_()) + 1
      local entry = {
        kind = kind,
        name = name,
        line = start_line,
        end_line = end_line,
        signature = get_signature(child),
        children = {},
      }
      table.insert(parent_list, entry)
      walk(child, depth + 1, entry.children)
    elseif depth < 4 then
      walk(child, depth, parent_list)
    end
  end
end

local results = {}
walk(root, 0, results)

if #results == 0 then
  return {{ kind = "info", name = "No structural symbols found (file may be too simple or language unsupported)", line = 0, end_line = 0, signature = "", children = {} }}
end

return results
`;

export async function getOutline(
  nvim: NeovimClient,
  file: string
): Promise<string> {
  const cwd = await nvim.getCwd();
  const entries = await nvim.lua<OutlineEntry[]>(OUTLINE_LUA, [file]);
  return formatOutline(entries, file, cwd);
}
