import { NeovimClient } from "../neovim.js";
import { DiagnosticResult, formatDiagnostics } from "../formatters.js";

const GET_DIAGNOSTICS_LUA = `
local filepath, severity = ...

local bufnr = nil
if filepath and filepath ~= vim.NIL then
  bufnr = vim.fn.bufnr(filepath)
  if bufnr == -1 then
    bufnr = vim.fn.bufadd(filepath)
    vim.fn.bufload(bufnr)
  end
end

local opts = {}
if severity and severity ~= vim.NIL then
  local sev_map = { error = 1, warn = 2, info = 3, hint = 4 }
  local min_sev = sev_map[severity]
  if min_sev then
    opts.severity = { min = min_sev }
  end
end

local diags = vim.diagnostic.get(bufnr, opts)
local result = {}
local count = 0
for _, d in ipairs(diags) do
  if count >= 100 then break end
  table.insert(result, {
    file = vim.api.nvim_buf_get_name(d.bufnr),
    line = d.lnum + 1,
    col = d.col + 1,
    severity = ({ "ERROR", "WARN", "INFO", "HINT" })[d.severity] or "UNKNOWN",
    message = d.message,
    source = d.source or "",
    code = d.code or "",
  })
  count = count + 1
end
return result
`;

export async function getDiagnostics(
  nvim: NeovimClient,
  file?: string,
  severity?: string
): Promise<string> {
  const cwd = await nvim.getCwd();
  const diags = await nvim.lua<DiagnosticResult[]>(GET_DIAGNOSTICS_LUA, [
    file ?? null,
    severity ?? null,
  ]);
  return formatDiagnostics(diags, file, cwd);
}
