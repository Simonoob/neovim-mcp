import { NeovimClient } from "../neovim.js";
import { QuickfixItem, formatQuickfix } from "../formatters.js";

const GET_QUICKFIX_LUA = `
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
`;

interface QuickfixResult {
  title: string;
  items: QuickfixItem[];
}

export async function getQuickfix(nvim: NeovimClient): Promise<string> {
  const cwd = await nvim.getCwd();
  const result = await nvim.lua<QuickfixResult>(GET_QUICKFIX_LUA);
  return formatQuickfix(result.title, result.items, cwd);
}
