local clients = vim.lsp.get_clients()
if #clients == 0 then
  return { error = "No LSP clients running" }
end

-- Collect client configs before stopping
local configs = {}
for _, client in ipairs(clients) do
  table.insert(configs, {
    name = client.name,
    cmd = client.config.cmd,
    root_dir = client.config.root_dir,
    buffers = vim.tbl_keys(client.attached_buffers or {}),
  })
  client:stop()
end

-- Wait for clients to stop
vim.wait(2000, function()
  return #vim.lsp.get_clients() == 0
end, 100)

-- Restart each client on its original buffers
for _, cfg in ipairs(configs) do
  if cfg.cmd then
    for _, bufnr in ipairs(cfg.buffers) do
      if vim.api.nvim_buf_is_valid(bufnr) then
        vim.lsp.start({
          name = cfg.name,
          cmd = cfg.cmd,
          root_dir = cfg.root_dir,
        }, { bufnr = bufnr })
      end
    end
  end
end

-- Wait for clients to come back
vim.wait(5000, function()
  return #vim.lsp.get_clients() > 0
end, 100)

local new_names = {}
for _, client in ipairs(vim.lsp.get_clients()) do
  table.insert(new_names, client.name)
end

local stopped_names = {}
for _, cfg in ipairs(configs) do
  table.insert(stopped_names, cfg.name)
end

return { stopped = stopped_names, started = new_names }
