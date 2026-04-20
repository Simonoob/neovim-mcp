local query = ...

-- buffer should be already opened, no need to load it
local bufnr = vim.api.nvim_get_current_buf()

if not vim.wait(250, function()
  return #vim.lsp.get_clients({ bufnr = bufnr }) > 0
end) then
  return { error = "No LSP client attached to current buffer" }
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

local process_and_return_results = function(results)
  local symbols = {}
  for _, res in pairs(results) do
    if res.result then
      for _, sym in ipairs(res.result) do
        if #symbols >= 50 then
          break
        end
        local loc = sym.location
        table.insert(symbols, {
          name = sym.name,
          kind = kind_map[sym.kind] or "Unknown",
          file = vim.uri_to_fname(loc.uri),
          line = loc.range.start.line + 1,
          col = loc.range.start.character + 1,
        })
      end
    end
  end
  return symbols
end

local results = nil

vim.lsp.buf_request_all(bufnr, "workspace/symbol", { query = query }, function(res)
  results = process_and_return_results(res)
end)

if not vim.wait(10000, function()
  return results ~= nil
end) then
  return { error = "LSP workspace symbols request timed out" }
end

return results
