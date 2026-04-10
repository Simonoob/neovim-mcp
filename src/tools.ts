import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";
import { NeovimClient } from "./neovim.js";
import {
  toolResult,
  toolError,
  relativePath,
  shellEscape,
  execSafe,
} from "./utils.js";

// --- Load Lua snippets from files ---

const luaDir = join(dirname(fileURLToPath(import.meta.url)), "lua");
const lua = (name: string) => readFileSync(join(luaDir, name), "utf-8");

const OUTLINE_LUA = lua("outline.lua");
const AST_CONTEXT_LUA = lua("ast-context.lua");
const SEARCH_SYMBOLS_LUA = lua("search-symbols.lua");
const GET_DIAGNOSTICS_LUA = lua("diagnostics.lua");
const GET_REFERENCES_LUA = lua("references.lua");
const GOTO_DEFINITION_LUA = lua("definition.lua");
const GET_QUICKFIX_LUA = lua("quickfix.lua");

// --- Outline formatter (recursive, so not a one-liner) ---

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

// --- Tool registration ---

export function registerTools(server: McpServer, nvim: NeovimClient) {
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
        return toolResult(
          `# ${relativePath(file, cwd)}\n${fmtOutline(entries)}`,
        );
      } catch (e) {
        return toolError(e);
      }
    },
  );

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
        if (!chain?.length)
          return toolResult("No AST context at this position.");
        const header = `AST context at ${relativePath(file, cwd)}:${line}:\n`;
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
            `  [${s.kind}] ${s.name} -- ${relativePath(s.file, cwd)}:${s.line}:${s.col}`,
        );
        return toolResult(
          `Found ${result.length} symbols matching "${query}":\n\n${lines.join("\n")}`,
        );
      } catch (e) {
        return toolError(e);
      }
    },
  );

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
        const scope = file ? ` (file: ${relativePath(file, cwd)})` : "";
        if (!diags?.length) return toolResult(`No diagnostics${scope}.`);
        const lines = diags.map((d) => {
          const f = file ? "" : `${relativePath(d.file, cwd)}:`;
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

  server.registerTool(
    "get_references",
    {
      description:
        "Find all references to a symbol at a given position via LSP",
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
            `No references found at ${relativePath(file, cwd)}:${line}:${col}.`,
          );
        const lines = result.map((r) => {
          const text = r.text ? ` -- ${r.text.trim()}` : "";
          return `  ${relativePath(r.file, cwd)}:${r.line}:${r.col}${text}`;
        });
        return toolResult(
          `${result.length} references:\n\n${lines.join("\n")}`,
        );
      } catch (e) {
        return toolError(e);
      }
    },
  );

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
          | Array<{
              file: string;
              line: number;
              col: number;
              signature: string;
            }>
          | { error: string }
        >(GOTO_DEFINITION_LUA, [file, line, col]);
        if (!Array.isArray(result)) return toolResult(result.error);
        if (!result.length)
          return toolResult(
            `No definition found at ${relativePath(file, cwd)}:${line}:${col}.`,
          );
        const lines = result.flatMap((d) => {
          const loc = `  ${relativePath(d.file, cwd)}:${d.line}:${d.col}`;
          return d.signature ? [loc, `    ${d.signature}`] : [loc];
        });
        return toolResult(
          `Definition from ${relativePath(file, cwd)}:${line}:${col}:\n\n${lines.join("\n")}`,
        );
      } catch (e) {
        return toolError(e);
      }
    },
  );

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
          return `  ${relativePath(item.file, cwd)}:${item.line}:${item.col}  ${t}${item.text.trim()}`;
        });
        return toolResult(
          `${header} (${qf.items.length} items):\n\n${lines.join("\n")}`,
        );
      } catch (e) {
        return toolError(e);
      }
    },
  );

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
      description:
        "Search file contents using ripgrep (does not require Neovim)",
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
}
