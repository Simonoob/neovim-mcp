local clients = vim.lsp.get_clients()
if #clients == 0 then
  return { error = "No LSP clients running" }
end

local names = {}
for _, client in ipairs(clients) do
  table.insert(names, client.name)
  client:stop()
end

-- Wait for clients to stop, then restart via filetype re-detection
vim.wait(2000, function()
  return #vim.lsp.get_clients() == 0
end, 100)

-- Trigger re-attach on all loaded buffers
for _, bufnr in ipairs(vim.api.nvim_list_bufs()) do
  if vim.api.nvim_buf_is_loaded(bufnr) and vim.bo[bufnr].filetype ~= "" then
    vim.api.nvim_buf_call(bufnr, function()
      vim.cmd("edit")
    end)
  end
end

-- Wait for clients to come back
vim.wait(5000, function()
  return #vim.lsp.get_clients() > 0
end, 100)

local new_clients = vim.lsp.get_clients()
local new_names = {}
for _, client in ipairs(new_clients) do
  table.insert(new_names, client.name)
end

return { stopped = names, started = new_names }
