# src/

MCP server that exposes Neovim's LSP and treesitter as tools for LLMs.

- `index.ts` — Entry point. Creates the MCP server and starts stdio transport.
- `neovim.ts` — Singleton client that connects to a running Neovim instance via unix socket. Each method call creates a fresh connection.
- `tools.ts` — All tool registrations. Loads Lua snippets from `lua/`, sends them to Neovim via RPC, and formats the structured results into text.
- `utils.ts` — Shared helpers: MCP response builders, path formatting, shell escaping.

## Adding a new tool

1. Create a `.lua` file in `lua/` that returns structured data
2. Load it in `tools.ts` with `loadLua("your-file.lua")`
3. Register with `server.registerTool()` inside `registerTools()`
4. Rebuild — `npm run build`
