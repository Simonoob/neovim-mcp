#!/usr/bin/env node

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { execSync } from "node:child_process";
import { z } from "zod";
import { NeovimClient } from "./neovim.js";

const server = new McpServer({ name: "neovim-mcp", version: "0.1.0" });
const nvim = NeovimClient.getInstance();

// --- Helpers ---

function toolResult(text: string) {
  return { content: [{ type: "text" as const, text }] };
}

function toolError(error: unknown) {
  const msg = error instanceof Error ? error.message : String(error);
  return { content: [{ type: "text" as const, text: `Error: ${msg}` }] };
}

function rel(filePath: string, cwd: string): string {
  if (filePath.startsWith(cwd + "/")) return filePath.slice(cwd.length + 1);
  if (filePath.startsWith(cwd)) return filePath.slice(cwd.length);
  return filePath;
}

function shellEscape(s: string): string {
  return "'" + s.replace(/'/g, "'\\''") + "'";
}

function execSafe(cmd: string, cwd: string, timeout: number): string {
  try {
    return execSync(cmd, {
      cwd,
      encoding: "utf-8",
      timeout,
      stdio: ["pipe", "pipe", "pipe"],
    });
  } catch (error) {
    if ((error as { status?: number })?.status === 1) return "";
    throw error;
  }
}

// --- Health check ---

server.registerTool(
  "vim_health",
  { description: "Check Neovim connection health" },
  async () => {
    const healthy = await nvim.healthCheck();
    return toolResult(
      healthy
        ? "Neovim connection is healthy."
        : "Neovim connection failed. Is Neovim running with --listen /tmp/nvim?",
    );
  },
);

// --- Outline (treesitter) ---

const OUTLINE_LUA = `
local filepath = select(1, ...)
local bufnr = vim.fn.bufadd(filepath)
vim.fn.bufload(bufnr)

local ok, parser = pcall(vim.treesitter.get_parser, bufnr)
if not ok or not parser then
  return {{ kind = "error", name = "No treesitter parser for this file", line = 0, end_line = 0, signature = "", children = {} }}
end

local tree = parser:parse()[1]
if not tree then
  return {{ kind = "error", name = "Failed to parse file", line = 0, end_line = 0, signature = "", children = {} }}
end

local kinds = {
  function_declaration = "function", function_definition = "function",
  method_definition = "function", method_declaration = "function",
  arrow_function = "function", function_item = "function", function_statement = "function",
  class_declaration = "class", class_definition = "class",
  interface_declaration = "interface", type_alias_declaration = "type",
  enum_declaration = "enum", struct_item = "struct",
  enum_item = "enum", impl_item = "impl", trait_item = "trait",
  module_declaration = "module",
}

local function get_name(node)
  local n = node:child_by_field_name("name")
  if n then return vim.treesitter.get_node_text(n, bufnr) end
  if node:type() == "arrow_function" then
    local p = node:parent()
    if p and p:type() == "variable_declarator" then
      n = p:child_by_field_name("name")
      if n then return vim.treesitter.get_node_text(n, bufnr) end
    end
  end
  return nil
end

local function get_sig(node)
  local row = node:start()
  local lines = vim.api.nvim_buf_get_lines(bufnr, row, row + 1, false)
  if not lines[1] then return "" end
  local sig = vim.trim(lines[1])
  return #sig > 120 and sig:sub(1, 117) .. "..." or sig
end

local function walk(node, depth, out)
  for child in node:iter_children() do
    local kind = kinds[child:type()]
    if kind then
      local entry = {
        kind = kind,
        name = get_name(child) or "[anonymous]",
        line = child:start() + 1,
        end_line = select(1, child:end_()) + 1,
        signature = get_sig(child),
        children = {},
      }
      table.insert(out, entry)
      walk(child, depth + 1, entry.children)
    elseif depth < 4 then
      walk(child, depth, out)
    end
  end
end

local results = {}
walk(tree:root(), 0, results)
if #results == 0 then
  return {{ kind = "info", name = "No structural symbols found", line = 0, end_line = 0, signature = "", children = {} }}
end
return results
`;

interface OutlineEntry {
  kind: string;
  name: string;
  line: number;
  end_line: number;
  signature: string;
  children: OutlineEntry[];
}

function fmtOutline(entries: OutlineEntry[], depth = 0): string {
  const lines: string[] = [];
  const indent = "  ".repeat(depth);
  for (const e of entries) {
    lines.push(`${indent}[${e.kind}] ${e.name} (L${e.line}-${e.end_line})`);
    if (e.signature) lines.push(`${indent}  ${e.signature}`);
    if (e.children?.length) lines.push(fmtOutline(e.children, depth + 1));
  }
  return lines.join("\n");
}

server.registerTool(
  "get_outline",
  {
    description:
      "Get structured code outline of a file (functions, classes, types with line numbers and nesting)",
    inputSchema: {
      file: z.string().describe("Absolute or relative file path"),
    },
  },
  async ({ file }) => {
    try {
      const cwd = await nvim.getCwd();
      const entries = await nvim.lua<OutlineEntry[]>(OUTLINE_LUA, [file]);
      return toolResult(`# ${rel(file, cwd)}\n${fmtOutline(entries)}`);
    } catch (e) {
      return toolError(e);
    }
  },
);

// --- AST context (treesitter) ---

const AST_CONTEXT_LUA = `
local filepath, line = ...
local bufnr = vim.fn.bufadd(filepath)
vim.fn.bufload(bufnr)

local ok, parser = pcall(vim.treesitter.get_parser, bufnr)
if not ok or not parser then
  return {{ type = "error", name = "No treesitter parser for this file", line = 0 }}
end

parser:parse()
local node = vim.treesitter.get_node({ bufnr = bufnr, pos = { line - 1, 0 } })
if not node then
  return {{ type = "error", name = "No AST node at this position", line = 0 }}
end

local chain = {}
local current = node
while current do
  local name_node = current:child_by_field_name("name")
  local name = name_node and vim.treesitter.get_node_text(name_node, bufnr) or vim.NIL
  table.insert(chain, 1, { type = current:type(), name = name, line = current:start() + 1 })
  current = current:parent()
end
return chain
`;

server.registerTool(
  "get_ast_context",
  {
    description:
      "Get the treesitter scope chain at a position (shows enclosing functions, classes, blocks)",
    inputSchema: {
      file: z.string().describe("Absolute or relative file path"),
      line: z.number().describe("Line number (1-indexed)"),
    },
  },
  async ({ file, line }) => {
    try {
      const cwd = await nvim.getCwd();
      const chain = await nvim.lua<
        Array<{ type: string; name: string | null; line: number }>
      >(AST_CONTEXT_LUA, [file, line]);
      if (!chain?.length) return toolResult("No AST context at this position.");
      const header = `AST context at ${rel(file, cwd)}:${line}:\n`;
      const lines = chain.map((n, i) => {
        const indent = "  ".repeat(i + 1);
        const name = n.name ? ` "${n.name}"` : "";
        const marker = i === chain.length - 1 ? " <-- here" : "";
        return `${indent}${n.type}${name} (L${n.line})${marker}`;
      });
      return toolResult(header + lines.join("\n"));
    } catch (e) {
      return toolError(e);
    }
  },
);

// --- LSP: search symbols ---

const SEARCH_SYMBOLS_LUA = `
local query = select(1, ...)
local bufnr = vim.api.nvim_get_current_buf()
if #vim.lsp.get_clients({ bufnr = bufnr }) == 0 then
  return { error = "No LSP client attached to current buffer" }
end

local results = vim.lsp.buf_request_sync(bufnr, "workspace/symbol", { query = query }, 5000)
if not results then return { error = "LSP request timed out" } end

local kind_map = {
  [1]="File",[2]="Module",[3]="Namespace",[4]="Package",[5]="Class",
  [6]="Method",[7]="Property",[8]="Field",[9]="Constructor",[10]="Enum",
  [11]="Interface",[12]="Function",[13]="Variable",[14]="Constant",
  [15]="String",[16]="Number",[17]="Boolean",[18]="Array",[19]="Object",
  [20]="Key",[21]="Null",[22]="EnumMember",[23]="Struct",[24]="Event",
  [25]="Operator",[26]="TypeParameter",
}

local symbols = {}
for _, res in pairs(results) do
  if res.result then
    for _, sym in ipairs(res.result) do
      if #symbols >= 50 then break end
      local loc = sym.location
      table.insert(symbols, {
        name = sym.name,
        kind = kind_map[sym.kind] or "Unknown",
        file = vim.uri_to_fname(loc.uri),
        line = loc.range.start.line + 1,
        col = loc.range.start.character + 1,
      })
    end
  end
end
return symbols
`;

server.registerTool(
  "search_symbols",
  {
    description:
      "Search workspace symbols via LSP (functions, classes, types across the project)",
    inputSchema: {
      query: z.string().describe("Symbol name or pattern to search for"),
    },
  },
  async ({ query }) => {
    try {
      const cwd = await nvim.getCwd();
      const result = await nvim.lua<
        | Array<{
            name: string;
            kind: string;
            file: string;
            line: number;
            col: number;
          }>
        | { error: string }
      >(SEARCH_SYMBOLS_LUA, [query]);
      if (!Array.isArray(result)) return toolResult(result.error);
      if (!result.length)
        return toolResult(`No symbols found matching "${query}".`);
      const lines = result.map(
        (s) =>
          `  [${s.kind}] ${s.name} -- ${rel(s.file, cwd)}:${s.line}:${s.col}`,
      );
      return toolResult(
        `Found ${result.length} symbols matching "${query}":\n\n${lines.join("\n")}`,
      );
    } catch (e) {
      return toolError(e);
    }
  },
);

// --- LSP: diagnostics ---

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
  if sev_map[severity] then opts.severity = { min = sev_map[severity] } end
end

local diags = vim.diagnostic.get(bufnr, opts)
local result = {}
for i, d in ipairs(diags) do
  if i > 100 then break end
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
`;

server.registerTool(
  "get_diagnostics",
  {
    description:
      "Get LSP diagnostics (errors, warnings) for a file or the entire workspace",
    inputSchema: {
      file: z
        .string()
        .optional()
        .describe("File path to filter diagnostics (omit for all)"),
      severity: z
        .enum(["error", "warn", "info", "hint"])
        .optional()
        .describe("Minimum severity level"),
    },
  },
  async ({ file, severity }) => {
    try {
      const cwd = await nvim.getCwd();
      const diags = await nvim.lua<
        Array<{
          file: string;
          line: number;
          col: number;
          severity: string;
          message: string;
          source: string;
          code: string | number;
        }>
      >(GET_DIAGNOSTICS_LUA, [file ?? null, severity ?? null]);
      const scope = file ? ` (file: ${rel(file, cwd)})` : "";
      if (!diags?.length) return toolResult(`No diagnostics${scope}.`);
      const lines = diags.map((d) => {
        const f = file ? "" : `${rel(d.file, cwd)}:`;
        const src = d.source ? `[${d.source}] ` : "";
        const code = d.code ? ` (${d.code})` : "";
        return `  ${f}L${d.line}:${d.col}  ${d.severity}  ${src}${d.message}${code}`;
      });
      return toolResult(
        `${diags.length} diagnostics${scope}:\n\n${lines.join("\n")}`,
      );
    } catch (e) {
      return toolError(e);
    }
  },
);

// --- LSP: references ---

const GET_REFERENCES_LUA = `
local filepath, line, col = ...
local bufnr = vim.fn.bufadd(filepath)
vim.fn.bufload(bufnr)

vim.api.nvim_buf_call(bufnr, function()
  if vim.bo[bufnr].filetype == "" then vim.cmd("filetype detect") end
end)

if not vim.wait(3000, function()
  return #vim.lsp.get_clients({ bufnr = bufnr }) > 0
end, 100) then
  return { error = "No LSP client attached to " .. filepath .. " (timed out)" }
end

local params = {
  textDocument = { uri = vim.uri_from_fname(filepath) },
  position = { line = line - 1, character = col - 1 },
  context = { includeDeclaration = true },
}
local results = vim.lsp.buf_request_sync(bufnr, "textDocument/references", params, 10000)
if not results then return { error = "LSP references request timed out" } end

local refs = {}
for _, res in pairs(results) do
  if res.result then
    for _, loc in ipairs(res.result) do
      if #refs >= 50 then break end
      local ref_file = vim.uri_to_fname(loc.uri)
      local ref_line = loc.range.start.line + 1
      local ref_col = loc.range.start.character + 1
      local text = ""
      local rb = vim.fn.bufnr(ref_file)
      if rb ~= -1 then
        local lines = vim.api.nvim_buf_get_lines(rb, ref_line - 1, ref_line, false)
        text = lines[1] or ""
      end
      table.insert(refs, { file = ref_file, line = ref_line, col = ref_col, text = text })
    end
  end
end
return refs
`;

server.registerTool(
  "get_references",
  {
    description: "Find all references to a symbol at a given position via LSP",
    inputSchema: {
      file: z.string().describe("Absolute file path"),
      line: z.number().describe("Line number (1-indexed)"),
      col: z.number().describe("Column number (1-indexed)"),
    },
  },
  async ({ file, line, col }) => {
    try {
      const cwd = await nvim.getCwd();
      const result = await nvim.lua<
        | Array<{ file: string; line: number; col: number; text: string }>
        | { error: string }
      >(GET_REFERENCES_LUA, [file, line, col]);
      if (!Array.isArray(result)) return toolResult(result.error);
      if (!result.length)
        return toolResult(
          `No references found at ${rel(file, cwd)}:${line}:${col}.`,
        );
      const lines = result.map((r) => {
        const text = r.text ? ` -- ${r.text.trim()}` : "";
        return `  ${rel(r.file, cwd)}:${r.line}:${r.col}${text}`;
      });
      return toolResult(`${result.length} references:\n\n${lines.join("\n")}`);
    } catch (e) {
      return toolError(e);
    }
  },
);

// --- LSP: go to definition ---

const GOTO_DEFINITION_LUA = `
local filepath, line, col = ...
local bufnr = vim.fn.bufadd(filepath)
vim.fn.bufload(bufnr)

vim.api.nvim_buf_call(bufnr, function()
  if vim.bo[bufnr].filetype == "" then vim.cmd("filetype detect") end
end)

if not vim.wait(3000, function()
  return #vim.lsp.get_clients({ bufnr = bufnr }) > 0
end, 100) then
  return { error = "No LSP client attached to " .. filepath .. " (timed out)" }
end

local params = {
  textDocument = { uri = vim.uri_from_fname(filepath) },
  position = { line = line - 1, character = col - 1 },
}
local results = vim.lsp.buf_request_sync(bufnr, "textDocument/definition", params, 5000)
if not results then return { error = "LSP definition request timed out" } end

local defs = {}
for _, res in pairs(results) do
  if res.result then
    local items = res.result
    if items.uri then items = { items } end
    for _, loc in ipairs(items) do
      local def_file = vim.uri_to_fname(loc.uri or loc.targetUri or "")
      local range = loc.range or loc.targetRange
      local def_line = range and (range.start.line + 1) or 0
      local def_col = range and (range.start.character + 1) or 0
      local sig = ""
      local db = vim.fn.bufadd(def_file)
      vim.fn.bufload(db)
      local lines = vim.api.nvim_buf_get_lines(db, def_line - 1, def_line, false)
      sig = lines[1] and vim.trim(lines[1]) or ""
      table.insert(defs, { file = def_file, line = def_line, col = def_col, signature = sig })
    end
  end
end
return defs
`;

server.registerTool(
  "goto_definition",
  {
    description: "Go to definition of a symbol at a given position via LSP",
    inputSchema: {
      file: z.string().describe("Absolute file path"),
      line: z.number().describe("Line number (1-indexed)"),
      col: z.number().describe("Column number (1-indexed)"),
    },
  },
  async ({ file, line, col }) => {
    try {
      const cwd = await nvim.getCwd();
      const result = await nvim.lua<
        | Array<{ file: string; line: number; col: number; signature: string }>
        | { error: string }
      >(GOTO_DEFINITION_LUA, [file, line, col]);
      if (!Array.isArray(result)) return toolResult(result.error);
      if (!result.length)
        return toolResult(
          `No definition found at ${rel(file, cwd)}:${line}:${col}.`,
        );
      const lines = result.flatMap((d) => {
        const loc = `  ${rel(d.file, cwd)}:${d.line}:${d.col}`;
        return d.signature ? [loc, `    ${d.signature}`] : [loc];
      });
      return toolResult(
        `Definition from ${rel(file, cwd)}:${line}:${col}:\n\n${lines.join("\n")}`,
      );
    } catch (e) {
      return toolError(e);
    }
  },
);

// --- Quickfix ---

const GET_QUICKFIX_LUA = `
local qf = vim.fn.getqflist({ all = 1 })
local items = {}
for _, item in ipairs(qf.items or {}) do
  local fname = ""
  if item.bufnr and item.bufnr > 0 then fname = vim.api.nvim_buf_get_name(item.bufnr) end
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

server.registerTool(
  "get_quickfix",
  { description: "Get the current Neovim quickfix list contents" },
  async () => {
    try {
      const cwd = await nvim.getCwd();
      const qf = await nvim.lua<{
        title: string;
        items: Array<{
          file: string;
          line: number;
          col: number;
          text: string;
          type: string;
        }>;
      }>(GET_QUICKFIX_LUA);
      if (!qf.items?.length) return toolResult("Quickfix list is empty.");
      const header = qf.title ? `Quickfix: ${qf.title}` : "Quickfix list";
      const lines = qf.items.map((item) => {
        const t = item.type ? `[${item.type}] ` : "";
        return `  ${rel(item.file, cwd)}:${item.line}:${item.col}  ${t}${item.text.trim()}`;
      });
      return toolResult(
        `${header} (${qf.items.length} items):\n\n${lines.join("\n")}`,
      );
    } catch (e) {
      return toolError(e);
    }
  },
);

// --- Standalone search (no Neovim required for the search itself) ---

server.registerTool(
  "fuzzy_find_files",
  {
    description:
      "Fuzzy search for files by name using fzf (does not require Neovim)",
    inputSchema: {
      query: z.string().describe("Fuzzy search query for file names"),
      cwd: z
        .string()
        .optional()
        .describe("Working directory (defaults to Neovim cwd)"),
    },
  },
  async ({ query, cwd }) => {
    try {
      const workDir = cwd || (await nvim.getCwd());
      const out = execSafe(
        `rg --files --color never -g '!.git' -g '!node_modules' | fzf --filter=${shellEscape(query)} | head -20`,
        workDir,
        5000,
      );
      const files = out.trim().split("\n").filter(Boolean);
      if (!files.length)
        return toolResult(`No files found matching "${query}".`);
      return toolResult(
        `Files matching "${query}":\n\n${files.map((f) => `  ${f}`).join("\n")}`,
      );
    } catch (e) {
      return toolError(e);
    }
  },
);

server.registerTool(
  "fuzzy_grep",
  {
    description: "Search file contents using ripgrep (does not require Neovim)",
    inputSchema: {
      query: z.string().describe("Search pattern (supports regex)"),
      glob: z
        .string()
        .optional()
        .describe('File glob filter (e.g. "*.ts", "*.py")'),
      cwd: z
        .string()
        .optional()
        .describe("Working directory (defaults to Neovim cwd)"),
    },
  },
  async ({ query, glob, cwd }) => {
    try {
      const workDir = cwd || (await nvim.getCwd());
      const globArg = glob ? `-g ${shellEscape(glob)}` : "";
      const out = execSafe(
        `rg --color never --line-number --no-heading --max-count 5 --max-columns 200 ${globArg} -g '!.git' -g '!node_modules' ${shellEscape(query)} | head -30`,
        workDir,
        10000,
      );
      if (!out.trim())
        return toolResult(
          `No matches found for "${query}"${glob ? ` in ${glob}` : ""}.`,
        );
      const scope = glob ? ` in ${glob}` : "";
      return toolResult(`Matches for "${query}"${scope}:\n\n${out.trim()}`);
    } catch (e) {
      return toolError(e);
    }
  },
);

// --- Start server ---

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((error) => {
  console.error("Server error:", error);
  process.exit(1);
});
