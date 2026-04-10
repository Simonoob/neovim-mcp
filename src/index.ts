#!/usr/bin/env node

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { NeovimClient } from "./neovim.js";
import { getOutline } from "./tools/outline.js";
import { getAstContext } from "./tools/ast-context.js";
import { searchSymbols } from "./tools/symbols.js";
import { getDiagnostics } from "./tools/diagnostics.js";
import { getQuickfix } from "./tools/quickfix.js";
import { getReferences } from "./tools/references.js";
import { gotoDefinition } from "./tools/definition.js";
import { fuzzyFindFiles } from "./tools/fuzzy-files.js";
import { fuzzyGrep } from "./tools/fuzzy-grep.js";

const server = new McpServer({
  name: "neovim-mcp",
  version: "0.1.0",
});

const nvim = NeovimClient.getInstance();

function toolResult(text: string) {
  return { content: [{ type: "text" as const, text }] };
}

function toolError(error: unknown) {
  const msg = error instanceof Error ? error.message : String(error);
  return { content: [{ type: "text" as const, text: `Error: ${msg}` }] };
}

// --- Health check ---

server.registerTool(
  "vim_health",
  {
    description: "Check Neovim connection health",
  },
  async () => {
    const healthy = await nvim.healthCheck();
    return toolResult(
      healthy
        ? "Neovim connection is healthy."
        : "Neovim connection failed. Is Neovim running with --listen /tmp/nvim?",
    );
  },
);

// --- Core navigation ---

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
      return toolResult(await getOutline(nvim, file));
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
      return toolResult(await getAstContext(nvim, file, line));
    } catch (e) {
      return toolError(e);
    }
  },
);

// --- LSP tools ---

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
      return toolResult(await searchSymbols(nvim, query));
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
      return toolResult(await getDiagnostics(nvim, file, severity));
    } catch (e) {
      return toolError(e);
    }
  },
);

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
      return toolResult(await getReferences(nvim, file, line, col));
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
      return toolResult(await gotoDefinition(nvim, file, line, col));
    } catch (e) {
      return toolError(e);
    }
  },
);

server.registerTool(
  "get_quickfix",
  {
    description: "Get the current Neovim quickfix list contents",
  },
  async () => {
    try {
      return toolResult(await getQuickfix(nvim));
    } catch (e) {
      return toolError(e);
    }
  },
);

// --- Standalone search ---

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
      return toolResult(await fuzzyFindFiles(query, workDir));
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
      return toolResult(await fuzzyGrep(query, workDir, glob));
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
