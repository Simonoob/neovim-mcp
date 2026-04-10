local filepath = select(1, ...)
local bufnr = vim.fn.bufadd(filepath)
vim.fn.bufload(bufnr)

vim.api.nvim_buf_call(bufnr, function()
  if vim.bo[bufnr].filetype == "" then
    vim.cmd("filetype detect")
  end
end)

if not vim.wait(3000, function()
  return #vim.lsp.get_clients({ bufnr = bufnr }) > 0
end, 100) then
  return { error = "No LSP client attached to " .. filepath .. " (timed out)" }
end

local params = { textDocument = { uri = vim.uri_from_fname(filepath) } }
local results = vim.lsp.buf_request_sync(bufnr, "textDocument/documentSymbol", params, 5000)
if not results then
  return { error = "LSP request timed out" }
end

local kind_map = {
  [1] = "File",
  [2] = "Module",
  [3] = "Namespace",
  [4] = "Package",
  [5] = "Class",
  [6] = "Method",
  [7] = "Property",
  [8] = "Field",
  [9] = "Constructor",
  [10] = "Enum",
  [11] = "Interface",
  [12] = "Function",
  [13] = "Variable",
  [14] = "Constant",
  [15] = "String",
  [16] = "Number",
  [17] = "Boolean",
  [18] = "Array",
  [19] = "Object",
  [20] = "Key",
  [21] = "Null",
  [22] = "EnumMember",
  [23] = "Struct",
  [24] = "Event",
  [25] = "Operator",
  [26] = "TypeParameter",
}

local function convert(symbols)
  local out = {}
  for _, sym in ipairs(symbols) do
    local range = sym.range or sym.location and sym.location.range
    local sl = range and (range.start.line + 1) or 0
    local el = range and (range["end"].line + 1) or sl
    table.insert(out, {
      kind = kind_map[sym.kind] or "Unknown",
      name = sym.name,
      line = sl,
      end_line = el,
      signature = sym.detail or "",
      children = sym.children and convert(sym.children) or {},
    })
  end
  return out
end

for _, res in pairs(results) do
  if res.result and #res.result > 0 then
    return convert(res.result)
  end
end
return {}
