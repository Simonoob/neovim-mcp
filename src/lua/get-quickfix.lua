return function()
  local quickfix_list = vim.fn.getqflist({ all = 1 })

  local formatted_items = {}

  for _, item in ipairs(quickfix_list.items or {}) do
    local filename = ""

    if item.bufnr and item.bufnr > 0 then
      filename = vim.api.nvim_buf_get_name(item.bufnr)
    end

    table.insert(formatted_items, {
      file = filename,
      line = item.lnum or 0,
      col = item.col or 0,
      text = item.text or "",
      type = item.type or "",
    })
  end

  return { title = quickfix_list.title or "", items = formatted_items }
end
