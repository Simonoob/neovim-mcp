import { NeovimClient } from "../neovim.js";
import { ReferenceResult, formatReferences } from "../formatters.js";

const GET_REFERENCES_LUA = `
local filepath, line, col = ...

local bufnr = vim.fn.bufadd(filepath)
vim.fn.bufload(bufnr)

-- Ensure filetype detection so LSP attaches
vim.api.nvim_buf_call(bufnr, function()
  if vim.bo[bufnr].filetype == "" then
    vim.cmd("filetype detect")
  end
end)

-- Wait for LSP to attach (up to 3s)
local attached = vim.wait(3000, function()
  return #vim.lsp.get_clients({ bufnr = bufnr }) > 0
end, 100)

if not attached then
  return { error = "No LSP client attached to " .. filepath .. " (timed out)" }
end

local clients = vim.lsp.get_clients({ bufnr = bufnr })
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
local count = 0
for _, res in pairs(results) do
  if res.result then
    for _, loc in ipairs(res.result) do
      if count >= 50 then break end
      local ref_file = vim.uri_to_fname(loc.uri)
      local ref_line = loc.range.start.line + 1
      local ref_col = loc.range.start.character + 1
      -- Try to get the line text for context
      local text = ""
      local ref_bufnr = vim.fn.bufnr(ref_file)
      if ref_bufnr ~= -1 then
        local lines = vim.api.nvim_buf_get_lines(ref_bufnr, ref_line - 1, ref_line, false)
        text = lines[1] or ""
      end
      table.insert(refs, {
        file = ref_file,
        line = ref_line,
        col = ref_col,
        text = text,
      })
      count = count + 1
    end
  end
end
return refs
`;

export async function getReferences(
  nvim: NeovimClient,
  file: string,
  line: number,
  col: number
): Promise<string> {
  const cwd = await nvim.getCwd();
  const result = await nvim.lua<ReferenceResult[] | { error: string }>(
    GET_REFERENCES_LUA,
    [file, line, col]
  );

  if (!Array.isArray(result) && "error" in result) {
    return result.error;
  }

  // Derive symbol name from position for display
  const symbol = `symbol at ${file}:${line}:${col}`;
  return formatReferences(result as ReferenceResult[], symbol, cwd);
}
