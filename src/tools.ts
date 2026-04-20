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
// import { bundle as luaBundle } from "luabundle";

// Lua snippets are read once at startup — MCP server restart needed after changes
const luaDir = join(dirname(fileURLToPath(import.meta.url)), "lua");
const loadLua = (name: string) => readFileSync(join(luaDir, name), "utf-8");

const DOCUMENT_SYMBOLS_LUA = loadLua("document-symbols.lua");
const AST_CONTEXT_LUA = loadLua("ast-context.lua");
const WORKSPACE_SYMBOLS_LUA = loadLua("workspace-symbols.lua");
const GET_DIAGNOSTICS_LUA = loadLua("diagnostics.lua");
const GET_REFERENCES_LUA = loadLua("references.lua");
const DEFINITION_LUA_OLD = loadLua("definition-old.lua");
const INDEX_LUA = loadLua("index.lua");
const HOVER_LUA = loadLua("hover.lua");
const RESTART_LSP_LUA = loadLua("restart-lsp.lua");
const IMPLEMENTATION_LUA = loadLua("implementation.lua");
const GET_QUICKFIX_LUA = loadLua("get-quickfix.lua");
const SET_QUICKFIX_LUA = loadLua("set-quickfix.lua");

interface OutlineEntry {
  kind: string;
  name: string;
  line: number;
  end_line: number;
  signature: string;
  children: OutlineEntry[];
}

// Keeps matching nodes and their ancestors so the hierarchy stays intact
function filterSymbols(entries: OutlineEntry[], query: string): OutlineEntry[] {
  const q = query.toLowerCase();
  const out: OutlineEntry[] = [];
  for (const e of entries) {
    const childMatches = filterSymbols(e.children ?? [], query);
    if (e.name.toLowerCase().includes(q) || childMatches.length) {
      out.push({ ...e, children: childMatches });
    }
  }
  return out;
}

function formatOutline(entries: OutlineEntry[], depth = 0): string {
  const lines: string[] = [];
  const indent = "  ".repeat(depth);
  for (const e of entries) {
    lines.push(`${indent}[${e.kind}] ${e.name} (L${e.line}-${e.end_line})`);
    if (e.signature) lines.push(`${indent}  ${e.signature}`);
    if (e.children?.length) lines.push(formatOutline(e.children, depth + 1));
  }
  return lines.join("\n");
}

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
    "restart_lsp",
    {
      description:
        "Restart all running LSP clients. Use after making changes to files outside Neovim to refresh diagnostics and symbol data.",
    },
    async () => {
      try {
        const result = await nvim.lua<
          { stopped: string[]; started: string[] } | { error: string }
        >(RESTART_LSP_LUA);
        if ("error" in result) return toolResult(result.error);
        const stopped = result.stopped.join(", ");
        const started = result.started.length
          ? result.started.join(", ")
          : "none (may still be starting)";
        return toolResult(`Stopped: ${stopped}\nStarted: ${started}`);
      } catch (e) {
        return toolError(e);
      }
    },
  );

  // server.registerTool(
  //   "get_document_symbols",
  //   {
  //     description:
  //       "Get LSP document symbols for a file (functions, classes, types with line numbers and nesting). Optionally filter by name.",
  //     inputSchema: {
  //       file: z.string().describe("Absolute or relative file path"),
  //       query: z
  //         .string()
  //         .optional()
  //         .describe(
  //           "Filter symbols by name (case-insensitive substring match)",
  //         ),
  //     },
  //   },
  //   async ({ file, query }) => {
  //     try {
  //       const cwd = await nvim.getCwd();
  //       const result = await nvim.lua<OutlineEntry[] | { error: string }>(
  //         DOCUMENT_SYMBOLS_LUA,
  //         [file],
  //       );
  //       if (!Array.isArray(result)) return toolResult(result.error);
  //       const filtered = query ? filterSymbols(result, query) : result;
  //       if (!filtered.length)
  //         return toolResult(
  //           query
  //             ? `No symbols matching "${query}" in ${relativePath(file, cwd)}.`
  //             : "No symbols found.",
  //         );
  //       return toolResult(
  //         `# ${relativePath(file, cwd)}\n${formatOutline(filtered)}`,
  //       );
  //     } catch (e) {
  //       return toolError(e);
  //     }
  //   },
  // );
  //
  // server.registerTool(
  //   "get_ast_context",
  //   {
  //     description:
  //       "Get the treesitter scope chain at a position (shows enclosing functions, classes, blocks)",
  //     inputSchema: {
  //       file: z.string().describe("Absolute or relative file path"),
  //       line: z.number().describe("Line number (1-indexed)"),
  //     },
  //   },
  //   async ({ file, line }) => {
  //     try {
  //       const cwd = await nvim.getCwd();
  //       const chain = await nvim.lua<
  //         Array<{ type: string; name: string | null; line: number }>
  //       >(AST_CONTEXT_LUA, [file, line]);
  //       if (!chain?.length)
  //         return toolResult("No AST context at this position.");
  //       const header = `AST context at ${relativePath(file, cwd)}:${line}:\n`;
  //       const lines = chain.map((n, i) => {
  //         const indent = "  ".repeat(i + 1);
  //         const name = n.name ? ` "${n.name}"` : "";
  //         const marker = i === chain.length - 1 ? " <-- here" : "";
  //         return `${indent}${n.type}${name} (L${n.line})${marker}`;
  //       });
  //       return toolResult(header + lines.join("\n"));
  //     } catch (e) {
  //       return toolError(e);
  //     }
  //   },
  // );
  //
  // server.registerTool(
  //   "workspace_symbols",
  //   {
  //     description:
  //       "Search workspace symbols via LSP (functions, classes, types across the project)",
  //     inputSchema: {
  //       query: z.string().describe("Symbol name or pattern to search for"),
  //     },
  //   },
  //   async ({ query }) => {
  //     try {
  //       const cwd = await nvim.getCwd();
  //       const result = await nvim.lua<
  //         | Array<{
  //             name: string;
  //             kind: string;
  //             file: string;
  //             line: number;
  //             col: number;
  //           }>
  //         | { error: string }
  //       >(WORKSPACE_SYMBOLS_LUA, [query]);
  //       if (!Array.isArray(result)) return toolResult(result.error);
  //       if (!result.length)
  //         return toolResult(`No symbols found matching "${query}".`);
  //       const lines = result.map(
  //         (s) =>
  //           `  [${s.kind}] ${s.name} -- ${relativePath(s.file, cwd)}:${s.line}:${s.col}`,
  //       );
  //       return toolResult(
  //         `Found ${result.length} symbols matching "${query}":\n\n${lines.join("\n")}`,
  //       );
  //     } catch (e) {
  //       return toolError(e);
  //     }
  //   },
  // );
  //
  // server.registerTool(
  //   "get_diagnostics",
  //   {
  //     description:
  //       "Get LSP diagnostics (errors, warnings) for a file or the entire workspace",
  //     inputSchema: {
  //       file: z
  //         .string()
  //         .optional()
  //         .describe("File path to filter diagnostics (omit for all)"),
  //       severity: z
  //         .enum(["error", "warn", "info", "hint"])
  //         .optional()
  //         .describe("Minimum severity level"),
  //     },
  //   },
  //   async ({ file, severity }) => {
  //     try {
  //       const cwd = await nvim.getCwd();
  //       const diags = await nvim.lua<
  //         Array<{
  //           file: string;
  //           line: number;
  //           col: number;
  //           severity: string;
  //           message: string;
  //           source: string;
  //           code: string | number;
  //         }>
  //       >(GET_DIAGNOSTICS_LUA, [file ?? null, severity ?? null]);
  //       const scope = file ? ` (file: ${relativePath(file, cwd)})` : "";
  //       if (!diags?.length) return toolResult(`No diagnostics${scope}.`);
  //       const lines = diags.map((d) => {
  //         const f = file ? "" : `${relativePath(d.file, cwd)}:`;
  //         const src = d.source ? `[${d.source}] ` : "";
  //         const code = d.code ? ` (${d.code})` : "";
  //         return `  ${f}L${d.line}:${d.col}  ${d.severity}  ${src}${d.message}${code}`;
  //       });
  //       return toolResult(
  //         `${diags.length} diagnostics${scope}:\n\n${lines.join("\n")}`,
  //       );
  //     } catch (e) {
  //       return toolError(e);
  //     }
  //   },
  // );
  //
  // server.registerTool(
  //   "get_references",
  //   {
  //     description:
  //       "Find all references to a symbol at a given position via LSP",
  //     inputSchema: {
  //       file: z.string().describe("Absolute file path"),
  //       line: z.number().describe("Line number (1-indexed)"),
  //       col: z.number().describe("Column number (1-indexed)"),
  //     },
  //   },
  //   async ({ file, line, col }) => {
  //     try {
  //       const cwd = await nvim.getCwd();
  //       const result = await nvim.lua<
  //         | Array<{ file: string; line: number; col: number; text: string }>
  //         | { error: string }
  //       >(GET_REFERENCES_LUA, [file, line, col]);
  //       if (!Array.isArray(result)) return toolResult(result.error);
  //       if (!result.length)
  //         return toolResult(
  //           `No references found at ${relativePath(file, cwd)}:${line}:${col}.`,
  //         );
  //       const lines = result.map((r) => {
  //         const text = r.text ? ` -- ${r.text.trim()}` : "";
  //         return `  ${relativePath(r.file, cwd)}:${r.line}:${r.col}${text}`;
  //       });
  //       return toolResult(
  //         `${result.length} references:\n\n${lines.join("\n")}`,
  //       );
  //     } catch (e) {
  //       return toolError(e);
  //     }
  //   },
  // );
  //
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
          // >(`${DEFINITION_LUA_OLD}`, [file, line, col]);
        >(`${INDEX_LUA}.definition`, [file, line, col]);
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
  //
  // server.registerTool(
  //   "goto_implementation",
  //   {
  //     description:
  //       "Find implementations of an interface or abstract method via LSP",
  //     inputSchema: {
  //       file: z.string().describe("Absolute file path"),
  //       line: z.number().describe("Line number (1-indexed)"),
  //       col: z.number().describe("Column number (1-indexed)"),
  //     },
  //   },
  //   async ({ file, line, col }) => {
  //     try {
  //       const cwd = await nvim.getCwd();
  //       const result = await nvim.lua<
  //         | Array<{
  //             file: string;
  //             line: number;
  //             col: number;
  //             signature: string;
  //           }>
  //         | { error: string }
  //       >(IMPLEMENTATION_LUA, [file, line, col]);
  //       if (!Array.isArray(result)) return toolResult(result.error);
  //       if (!result.length)
  //         return toolResult(
  //           `No implementations found at ${relativePath(file, cwd)}:${line}:${col}.`,
  //         );
  //       const lines = result.flatMap((d) => {
  //         const loc = `  ${relativePath(d.file, cwd)}:${d.line}:${d.col}`;
  //         return d.signature ? [loc, `    ${d.signature}`] : [loc];
  //       });
  //       return toolResult(
  //         `${result.length} implementations:\n\n${lines.join("\n")}`,
  //       );
  //     } catch (e) {
  //       return toolError(e);
  //     }
  //   },
  // );
  //
  // server.registerTool(
  //   "hover",
  //   {
  //     description:
  //       "Get LSP hover information (type signature, documentation) for a symbol at a position",
  //     inputSchema: {
  //       file: z.string().describe("Absolute file path"),
  //       line: z.number().describe("Line number (1-indexed)"),
  //       col: z.number().describe("Column number (1-indexed)"),
  //     },
  //   },
  //   async ({ file, line, col }) => {
  //     try {
  //       const cwd = await nvim.getCwd();
  //       const result = await nvim.lua<
  //         { text: string; kind?: string } | { error: string }
  //       >(HOVER_LUA, [file, line, col]);
  //       if ("error" in result) return toolResult(result.error);
  //       const header = `Hover at ${relativePath(file, cwd)}:${line}:${col}:\n`;
  //       return toolResult(header + "\n" + result.text);
  //     } catch (e) {
  //       return toolError(e);
  //     }
  //   },
  // );
  //
  // server.registerTool(
  //   "get_quickfix",
  //   { description: "Get the current Neovim quickfix list contents" },
  //   async () => {
  //     try {
  //       const cwd = await nvim.getCwd();
  //       const qf = await nvim.lua<{
  //         title: string;
  //         items: Array<{
  //           file: string;
  //           line: number;
  //           col: number;
  //           text: string;
  //           type: string;
  //         }>;
  //       }>(GET_QUICKFIX_LUA);
  //       if (!qf.items?.length) return toolResult("Quickfix list is empty.");
  //       const header = qf.title ? `Quickfix: ${qf.title}` : "Quickfix list";
  //       const lines = qf.items.map((item) => {
  //         const t = item.type ? `[${item.type}] ` : "";
  //         return `  ${relativePath(item.file, cwd)}:${item.line}:${item.col}  ${t}${item.text.trim()}`;
  //       });
  //       return toolResult(
  //         `${header} (${qf.items.length} items):\n\n${lines.join("\n")}`,
  //       );
  //     } catch (e) {
  //       return toolError(e);
  //     }
  //   },
  // );
  //
  // server.registerTool(
  //   "set_quickfix",
  //   {
  //     description:
  //       "Set the Neovim quickfix list with a list of locations (e.g. feature touchpoints, search results, related code sites)",
  //     inputSchema: {
  //       items: z
  //         .array(
  //           z.object({
  //             file: z.string().describe("Absolute file path"),
  //             line: z
  //               .number()
  //               .optional()
  //               .describe("Line number (1-indexed, defaults to 1)"),
  //             col: z
  //               .number()
  //               .optional()
  //               .describe("Column number (1-indexed, defaults to 1)"),
  //             text: z
  //               .string()
  //               .optional()
  //               .describe("Description of this location"),
  //           }),
  //         )
  //         .describe("List of locations to populate the quickfix list"),
  //       title: z.string().optional().describe("Title for the quickfix list"),
  //     },
  //   },
  //   async ({ items, title }) => {
  //     try {
  //       const count = await nvim.lua<number>(SET_QUICKFIX_LUA, [
  //         JSON.stringify(items),
  //         title ?? "Claude",
  //       ]);
  //       return toolResult(`Quickfix list set with ${count} items.`);
  //     } catch (e) {
  //       return toolError(e);
  //     }
  //   },
  // );
}
