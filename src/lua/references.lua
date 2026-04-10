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
  context = { includeDeclaration = true },
}
local results = vim.lsp.buf_request_sync(bufnr, "textDocument/references", params, 10000)
if not results then
  return { error = "LSP references request timed out" }
end

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
