---@param items_json string the stringified JSON object
---@param title string
return function(items_json, title)
  local items = vim.json.decode(items_json)
  local qf_items = {}
  for _, item in ipairs(items) do
    table.insert(qf_items, {
      filename = item.file,
      lnum = item.line or 1,
      col = item.col or 1,
      text = item.text or "",
      type = item.type or "",
    })
  end

  vim.fn.setqflist({}, " ", { title = title or "AI", items = qf_items })
  return #qf_items
end
