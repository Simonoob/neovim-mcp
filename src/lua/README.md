# lua/

Lua snippets executed inside Neovim via `nvim.lua()`. Each file is a self-contained chunk that receives arguments via `...` and returns structured data (tables/strings) back to TypeScript.

These run in the Neovim Lua runtime with full access to `vim.*` APIs, LSP, and treesitter.

`utils.lua` contains utility functions shared between files.

## Conventions

- Arguments come in via `local arg1, arg2 = ...`
- Return structured tables — TypeScript handles formatting
- Errors: return `{ error = "message" }` for expected failures (no LSP, timeout)
- Files that need LSP should detect filetype and wait for attachment (see `references.lua` as reference)
- Copied to `build/lua/` at build time and read once at MCP server startup
