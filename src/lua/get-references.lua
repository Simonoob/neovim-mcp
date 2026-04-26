---@param filepath string
---@param line integer
---@param col integer
return function(filepath, line, col)
  local utils = require("src.lua.utils")
  local bufnr = utils.load_buffer_with_path(filepath)

  utils.lsp_available_await(bufnr)

  local params = {
    textDocument = { uri = vim.uri_from_fname(filepath) },
    position = { line = line - 1, character = col - 1 },
    context = { includeDeclaration = true },
  }

  local process_and_return_results = function(results)
    local refs = {}
    for _, res in pairs(results) do
      if res.result then
        for _, loc in ipairs(res.result) do
          if #refs >= 50 then
            break
          end
          local ref_file = vim.uri_to_fname(loc.uri)
          local ref_line = loc.range.start.line + 1
          local ref_col = loc.range.start.character + 1
          local text = ""
          local rb = vim.fn.bufnr(ref_file)
          if rb ~= -1 then
            local lines = vim.api.nvim_buf_get_lines(rb, ref_line - 1, ref_line, false)
            text = lines[1] or ""
          end
          table.insert(refs, { file = ref_file, line = ref_line, col = ref_col, text = text })
        end
      end
    end
    return refs
  end

  local results = nil

  vim.lsp.buf_request_all(bufnr, "textDocument/references", params, function(res)
    results = process_and_return_results(res)
  end)

  if not vim.wait(500, function()
    return results ~= nil
  end) then
    return { error = "LSP references request timed out" }
  end

  return results
end
