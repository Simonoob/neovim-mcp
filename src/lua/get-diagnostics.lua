---@param filepath string
---@param sevcerity string
return function(filepath, severity)
  -- arguments are optional

  local bufnr = nil
  if filepath and filepath ~= vim.NIL then
    bufnr = vim.fn.bufnr(filepath)
    vim.fn.bufload(bufnr)
  end

  local opts = {}
  if severity and severity ~= vim.NIL then
    local sev_map = { error = 1, warn = 2, info = 3, hint = 4 }
    if sev_map[severity] then
      opts.severity = { min = sev_map[severity] }
    end
  end

  local diagnostics = vim.diagnostic.get(bufnr, opts)

  local result = {}
  for i, d in ipairs(diagnostics) do
    if i > 100 then -- cap number of returned entities
      break
    end

    table.insert(result, {
      file = vim.api.nvim_buf_get_name(d.bufnr),
      line = d.lnum + 1,
      col = d.col + 1,
      severity = ({ "ERROR", "WARN", "INFO", "HINT" })[d.severity] or "UNKNOWN",
      message = d.message,
      source = d.source or "",
      code = d.code or "",
    })
  end

  return result
end
