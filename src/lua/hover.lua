---@param filepath string
---@param line integer
---@param col integer
return function(filepath, line, col)
  local bufnr = vim.fn.bufadd(filepath)
  vim.fn.bufload(bufnr)

  -- lsp should be already loaded. Only wait 250ms for LSP clients to be attached to the buffer
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
    for _, res in pairs(results) do
      if res.result and res.result.contents then
        local contents = res.result.contents
        -- contents can be MarkedString, MarkedString[], or MarkupContent
        if type(contents) == "string" then
          return { text = contents }
        elseif contents.value then
          return { text = contents.value, kind = contents.kind or "" }
        elseif type(contents) == "table" and #contents > 0 then
          local parts = {}
          for _, c in ipairs(contents) do
            if type(c) == "string" then
              table.insert(parts, c)
            elseif c.value then
              table.insert(parts, c.value)
            end
          end
          return { text = table.concat(parts, "\n\n") }
        end
      end
    end
  end

  -- get definition with a timeout of 500ms
  local result = nil

  vim.lsp.buf_request_all(bufnr, "textDocument/hover", params, function(res)
    result = process_and_return_results(res)
  end)

  if not vim.wait(500, function()
    return result ~= nil
  end) then
    return { error = "LSP hover request timed out" }
  end

  return result
end
