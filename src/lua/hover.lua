local filepath, line, col = ...
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

local params = {
  textDocument = { uri = vim.uri_from_fname(filepath) },
  position = { line = line - 1, character = col - 1 },
}
local results = vim.lsp.buf_request_sync(bufnr, "textDocument/hover", params, 5000)
if not results then
  return { error = "LSP hover request timed out" }
end

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
return { error = "No hover information available" }
