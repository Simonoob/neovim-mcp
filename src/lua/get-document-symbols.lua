---@param filepath string
return function(filepath)
  local utils = require("src.lua.utils")
  local bufnr = utils.load_buffer_with_path(filepath)

  utils.lsp_available_await(bufnr)

  local params = { textDocument = { uri = vim.uri_from_fname(filepath) } }

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

  local process_and_return_results = function(results)
    for _, res in pairs(results) do
      if res.result and #res.result > 0 then
        return convert(res.result)
      end
    end
  end

  -- get symbols with a timeout of 500ms
  local results = {}

  vim.lsp.buf_request_all(bufnr, "textDocument/documentSymbol", params, function(res)
    results = process_and_return_results(res)
  end)

  if not vim.wait(500, function()
    return #results > 0
  end) then
    return { error = "LSP document symbols request timed out" }
  end

  return results
end
