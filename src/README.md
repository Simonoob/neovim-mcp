# src/
MCP server that exposes Neovim's LSP and Treesitter tools for LLM agents.

- `index.ts` — Entry point. Creates the MCP server with stdio transport method.
- `neovim.ts` — Singleton client that connects to a running Neovim instance via socket.
- `tools.ts` — All tool registrations. Creates tools' definitions to call LUA functions from `lua/index.lua` and to format the results.
- `utils.ts` — Shared helpers for the server layer: MCP response builders, path formatting, shell escaping.
- `lua/utils.lua` — Shared helpers for the LUA layer.

## Adding a new tool
1. Create a `.lua` file in `lua/`. It return a function that runs your LUA logic and returns results
2. add an entry in to the table in `lua/index.lua`
3. add a new tool definition using `server.registerTool()` in `tools.ts`
4. add tests in `tests/tools.test.ts`
5. rebuild the server and run the tests `npm run test`
