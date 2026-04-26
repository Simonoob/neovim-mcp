# lua/

`<name>.lua` each named file returns a function to run your LUA code (full access to the Neovim LUA context like e.g. `vim` table)
`index.lua` returns a table of all available functions. Imported by the TypeScript server.
`utils.lua` contains utility functions shared between files.

## Conventions

- add type hints for your arguments
- if not obvious, add type hints for the return values
- Return structured tables — TypeScript handles formatting
- Errors: return `{ error = "message" }` for expected failures (no LSP, timeout)
- Files that need LSP should detect filetype and wait for attachment (see `lsp_available_await` for reference)
