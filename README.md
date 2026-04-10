# neovim-mcp

An MCP server that lets AI coding assistants (Claude Code, Cursor, etc.) navigate your codebase using Neovim's built-in code intelligence — instead of blindly reading files and grepping.

## What this does

When an AI assistant needs to understand your code, it typically reads entire files or searches with regex. This server gives it access to the same tools you use as a developer:

- **File outlines** — functions, classes, types with line numbers (via treesitter)
- **Symbol search** — find anything by name across the project (via LSP)
- **Go to definition / references** — jump to where something is defined or used (via LSP)
- **Diagnostics** — see type errors and warnings (via LSP)
- **Quickfix list** — whatever Neovim has queued up
- **Fuzzy file search** — find files by partial name (via fzf)
- **Grep** — search file contents (via ripgrep)
- **AST context** — understand the code structure around a specific line (via treesitter)

It connects to a running Neovim instance over a socket. It's read-only — it never modifies your editor state.

## What's an MCP?

MCP (Model Context Protocol) is a standard that lets AI assistants use external tools. This project is an MCP "server" — a small program that exposes tools the assistant can call. You register it once, and the assistant discovers the tools automatically.

## What's needed from Neovim

Neovim has two features this relies on:

- **Treesitter** — a fast parser that understands code structure (functions, classes, etc.) without running the code. Neovim uses it for syntax highlighting; we use it for outlines and AST context.
- **LSP** (Language Server Protocol) — Neovim talks to language-specific servers (TypeScript, Python, etc.) that understand your code deeply: types, definitions, references, errors. You probably already have this if your editor shows type errors.

Neovim must be running with a listening socket so this server can talk to it.

## Prerequisites

- **Neovim** (0.9+) with treesitter and LSP configured
- **Node.js** (18+)
- **fzf** and **ripgrep** installed (for fuzzy search tools)

## Install

```bash
cd ~/coding/neovim-mcp
npm install
npm run build
```

### Make Neovim listen automatically

Add this to your Neovim config (e.g. `~/.config/nvim/lua/config/options.lua` or `init.lua`):

```lua
vim.fn.serverstart("/tmp/nvim")
```

This starts a socket listener every time Neovim opens. Without this, you'd have to launch Neovim with `nvim --listen /tmp/nvim` every time.

### Register with Claude Code

```bash
claude mcp add --transport stdio --scope user neovim-nav -- node ~/coding/neovim-mcp/build/index.js
```

Restart Claude Code. The tools will appear automatically.

### Register with other MCP clients

Add to your client's MCP config:

```json
{
  "neovim-nav": {
    "type": "stdio",
    "command": "node",
    "args": ["/absolute/path/to/neovim-mcp/build/index.js"],
    "env": {
      "NVIM_SOCKET_PATH": "/tmp/nvim"
    }
  }
}
```

## Tools

| Tool | What it does |
|---|---|
| `get_outline` | List functions, classes, types in a file with line numbers |
| `get_ast_context` | Show the code structure around a specific line |
| `search_symbols` | Find symbols by name across the workspace |
| `get_diagnostics` | Get errors and warnings from the language server |
| `get_references` | Find all usages of a symbol |
| `goto_definition` | Find where a symbol is defined |
| `get_quickfix` | Read the current quickfix list |
| `fuzzy_find_files` | Search for files by name |
| `fuzzy_grep` | Search file contents |
| `vim_health` | Check if Neovim is reachable |

## Configuration

| Env var | Default | Description |
|---|---|---|
| `NVIM_SOCKET_PATH` | `/tmp/nvim` | Path to Neovim's listening socket |
