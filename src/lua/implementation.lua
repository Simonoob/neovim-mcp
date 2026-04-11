local filepath, line, col = ...

local bufnr = vim.fn.bufadd(filepath)
vim.fn.bufload(bufnr)

if not vim.wait(250, function()
  return #vim.lsp.get_clients({ bufnr = bufnr }) > 0
end) then
  return { error = "No LSP client attached to " .. filepath .. " (timed out)" }
end

local params = {
  textDocument = { uri = vim.uri_from_fname(filepath) },
  position = { line = line - 1, character = col - 1 },
}

local process_and_return_results = function(results)
  local impls = {}
  for _, res in pairs(results) do
    if res.result then
      local items = res.result
      if items.uri then
        items = { items }
      end
      for _, loc in ipairs(items) do
        if #impls >= 50 then
          break
        end
        local impl_file = vim.uri_to_fname(loc.uri or loc.targetUri or "")
        local range = loc.range or loc.targetRange
        local impl_line = range and (range.start.line + 1) or 0
        local impl_col = range and (range.start.character + 1) or 0
        local sig = ""
        local ib = vim.fn.bufadd(impl_file)
        vim.fn.bufload(ib)
        local lines = vim.api.nvim_buf_get_lines(ib, impl_line - 1, impl_line, false)
        sig = lines[1] and vim.trim(lines[1]) or ""
        table.insert(impls, { file = impl_file, line = impl_line, col = impl_col, signature = sig })
      end
    end
  end
  return impls
end

-- get definition with a timeout of 500ms
local result = nil

local results = vim.lsp.buf_request_all(bufnr, "textDocument/implementation", params, function(res)
  result = process_and_return_results(res)
end)

if not vim.wait(500, function()
  return result ~= nil
end) then
  return { error = "LSP implementation request timed out" }
end

return result
