import { NeovimClient } from "../neovim.js";

const GOTO_DEFINITION_LUA = `
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

local params = {
  textDocument = { uri = vim.uri_from_fname(filepath) },
  position = { line = line - 1, character = col - 1 },
}

local results = vim.lsp.buf_request_sync(bufnr, "textDocument/definition", params, 5000)

if not results then
  return { error = "LSP definition request timed out" }
end

local defs = {}
for _, res in pairs(results) do
  if res.result then
    local items = res.result
    -- Handle single result (not array)
    if items.uri then items = { items } end
    for _, loc in ipairs(items) do
      local def_file = vim.uri_to_fname(loc.uri or loc.targetUri or "")
      local range = loc.range or loc.targetRange
      local def_line = range and (range.start.line + 1) or 0
      local def_col = range and (range.start.character + 1) or 0
      -- Get the signature line
      local signature = ""
      local def_bufnr = vim.fn.bufadd(def_file)
      vim.fn.bufload(def_bufnr)
      local lines = vim.api.nvim_buf_get_lines(def_bufnr, def_line - 1, def_line, false)
      signature = lines[1] and vim.trim(lines[1]) or ""
      table.insert(defs, {
        file = def_file,
        line = def_line,
        col = def_col,
        signature = signature,
      })
    end
  end
end
return defs
`;

interface DefinitionResult {
  file: string;
  line: number;
  col: number;
  signature: string;
}

function relativePath(filePath: string, cwd: string): string {
  if (filePath.startsWith(cwd)) {
    const rel = filePath.slice(cwd.length);
    return rel.startsWith("/") ? rel.slice(1) : rel;
  }
  return filePath;
}

export async function gotoDefinition(
  nvim: NeovimClient,
  file: string,
  line: number,
  col: number
): Promise<string> {
  const cwd = await nvim.getCwd();
  const result = await nvim.lua<DefinitionResult[] | { error: string }>(
    GOTO_DEFINITION_LUA,
    [file, line, col]
  );

  if (!Array.isArray(result) && "error" in result) {
    return result.error;
  }

  const defs = result as DefinitionResult[];
  if (!defs || defs.length === 0) {
    return `No definition found at ${relativePath(file, cwd)}:${line}:${col}.`;
  }

  const lines = [
    `Definition from ${relativePath(file, cwd)}:${line}:${col}:\n`,
  ];
  for (const def of defs) {
    lines.push(`  ${relativePath(def.file, cwd)}:${def.line}:${def.col}`);
    if (def.signature) {
      lines.push(`    signature: ${def.signature}`);
    }
  }
  return lines.join("\n");
}
