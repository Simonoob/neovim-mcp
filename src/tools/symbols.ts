import { NeovimClient } from "../neovim.js";
import { SymbolResult, formatSymbols } from "../formatters.js";

const SEARCH_SYMBOLS_LUA = `
local query = select(1, ...)

local bufnr = vim.api.nvim_get_current_buf()
local clients = vim.lsp.get_clients({ bufnr = bufnr })
if #clients == 0 then
  return { error = "No LSP client attached to current buffer" }
end

local params = { query = query }
local results = vim.lsp.buf_request_sync(bufnr, "workspace/symbol", params, 5000)

if not results then
  return { error = "LSP request timed out" }
end

local kind_map = {
  [1] = "File", [2] = "Module", [3] = "Namespace", [4] = "Package",
  [5] = "Class", [6] = "Method", [7] = "Property", [8] = "Field",
  [9] = "Constructor", [10] = "Enum", [11] = "Interface", [12] = "Function",
  [13] = "Variable", [14] = "Constant", [15] = "String", [16] = "Number",
  [17] = "Boolean", [18] = "Array", [19] = "Object", [20] = "Key",
  [21] = "Null", [22] = "EnumMember", [23] = "Struct", [24] = "Event",
  [25] = "Operator", [26] = "TypeParameter",
}

local symbols = {}
local count = 0
for _, res in pairs(results) do
  if res.result then
    for _, sym in ipairs(res.result) do
      if count >= 50 then break end
      local loc = sym.location
      table.insert(symbols, {
        name = sym.name,
        kind = kind_map[sym.kind] or "Unknown",
        file = vim.uri_to_fname(loc.uri),
        line = loc.range.start.line + 1,
        col = loc.range.start.character + 1,
      })
      count = count + 1
    end
  end
end
return symbols
`;

export async function searchSymbols(
  nvim: NeovimClient,
  query: string
): Promise<string> {
  const cwd = await nvim.getCwd();
  const result = await nvim.lua<SymbolResult[] | { error: string }>(
    SEARCH_SYMBOLS_LUA,
    [query]
  );

  if (!Array.isArray(result) && "error" in result) {
    return result.error;
  }

  return formatSymbols(result as SymbolResult[], query, cwd);
}
