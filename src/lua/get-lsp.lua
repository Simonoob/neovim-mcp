return function()
  local utils = require("src.lua.utils")
  local active_clients = vim.lsp.get_clients()

  local available_clients = vim.lsp._enabled_configs

  return {
    active = utils.table_map(active_clients, function(client)
      return client.name
    end),
    available = utils.table_map(available_clients, function(client)
      return client.name
    end),
  }
end
