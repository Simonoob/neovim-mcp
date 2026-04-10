local qf = vim.fn.getqflist({ all = 1 })
local items = {}
for _, item in ipairs(qf.items or {}) do
  local fname = ""
  if item.bufnr and item.bufnr > 0 then
    fname = vim.api.nvim_buf_get_name(item.bufnr)
  end
  table.insert(items, {
    file = fname,
    line = item.lnum or 0,
    col = item.col or 0,
    text = item.text or "",
    type = item.type or "",
  })
end
return { title = qf.title or "", items = items }
