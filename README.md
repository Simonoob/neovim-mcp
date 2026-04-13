> [!CAUTION]
⚠️ **WIP**: This MCP in under heavy development and testing. It should not be considered stable.


# neovim-mcp

This MCP server connects your AI assistant to your running Neovim instance, giving it access to LSP and treesitter: go-to-definition, find references, hover, diagnostics, symbol search, and more.

## Requirements

- **Neovim 0.9 or newer+** with LSP and treesitter configured
- **Node.js 18 or newer+**
- **fzf** and **ripgrep** (optional, for fuzzy file/content search tools)

## Setup

### 1. Neovim socket

The MCP server talks to Neovim over a unix socket at `/tmp/nvim`. The simplest way is to add this to your Neovim config:

```lua
vim.fn.serverstart("/tmp/nvim")
```

If you run multiple Neovim instances, a toggle keymap is better — it lets you choose which instance the MCP server talks to:

```lua
-- keymaps.lua
vim.keymap.set("n", "<leader>ts", function()
  if vim.tbl_contains(vim.fn.serverlist(), "/tmp/nvim") then
    vim.fn.serverstop("/tmp/nvim")
    vim.notify("MCP server released")
  else
    os.remove("/tmp/nvim")
    vim.fn.serverstart("/tmp/nvim")
    vim.notify("MCP server assigned to this instance")
  end
end, { desc = "[T]oggle MCP [S]erver to this instance" })
```

### 2. Build

```bash
npm install && npm run build
```

### 3. Register with your MCP client

**Claude Code:**
```bash
claude mcp add --transport stdio --scope user neovim-nav -- node /path/to/neovim-mcp/build/index.js
```

**Other clients** (Cursor, etc.) — add to your MCP config:
```json
{
  "neovim-nav": {
    "type": "stdio",
    "command": "node",
    "args": ["/path/to/neovim-mcp/build/index.js"]
  }
}
```

The server connects to `/tmp/nvim` by default. To use a different socket path:

```bash
# Claude Code
claude mcp add --transport stdio --scope user neovim-nav -e NVIM_SOCKET_PATH=/tmp/my-nvim -- node /path/to/neovim-mcp/build/index.js
```

```json
{
  "neovim-nav": {
    "type": "stdio",
    "command": "node",
    "args": ["/path/to/neovim-mcp/build/index.js"],
    "env": { "NVIM_SOCKET_PATH": "/tmp/my-nvim" }
  }
}
```

## Tools

| Tool | Description |
|---|---|
| `get_document_symbols` | File outline via LSP (with optional name filter) |
| `get_ast_context` | Treesitter scope chain at a position |
| `search_symbols` | Workspace-wide symbol search via LSP |
| `get_diagnostics` | LSP errors/warnings for a file or workspace |
| `get_references` | Find all usages of a symbol |
| `goto_definition` | Jump to where a symbol is defined |
| `goto_implementation` | Find implementations of an interface/abstract method |
| `hover` | Type signature and docs at a position |
| `get_quickfix` / `set_quickfix` | Read/write the Neovim quickfix list |
| `restart_lsp` | Restart LSP clients (useful after external file changes) |
| `fuzzy_find_files` / `fuzzy_grep` | File search via fzf, content search via ripgrep |
| `vim_health` | Connection check |

## Contributing

See [src/README.md](src/README.md) for project structure and how to add new tools.
