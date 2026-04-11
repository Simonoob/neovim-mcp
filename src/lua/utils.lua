local load_buffer_with_path = function(filepath)
  local bufnr = vim.fn.bufadd(filepath)
  vim.fn.bufload(bufnr)
  return bufnr
end

local lsp_available_await = function(bufnr)
  if not vim.wait(250, function()
    return #vim.lsp.get_clients({ bufnr = bufnr }) > 0
  end) then
    return { error = "No LSP client attached to " .. bufnr .. " (timed out)" }
  end
end

---@type table
local utils = {
  load_buffer_with_path = load_buffer_with_path,
  lsp_available_await = lsp_available_await,
}

return utils
