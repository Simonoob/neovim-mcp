> [!CAUTION]
⚠️ **WIP**: This MCP in under heavy development and testing. It should not be considered stable.


# neovim-mcp
Make your AI agent leverage Neovim for code navigation.

This MCP server allows you to leverage your Neovim installation so that your AI agent can:
- use LSP functionalities: go to definition, find references, find symbols etc.
- use Treesitter to inspect the AST (abstract syntaxt tree)
- read and write to your quickfix list

### How I use it
This is my typical workflow:
1. open the project in Neovim
2. instruct the agent to e.g. find the flow of a feature in the codebase
3. the agent uses builtin bash tools (e.g. `grep` and `find`) as well as tools from this MCP
4. the agent returns a summary of the feature and saves the result locations to the Neovim quickfix list, with details for each location

## Requirements
- a Neovim installation with LSP servers and treesitter
- tested with Neovim 0.11. Older versions might work but they it's not guaranteed.
- Node.js to run the MCP server

## Setup

### 1. Start Neovim on the reserved socket

The MCP server talks to Neovim over a unix socket at `/tmp/nvim`.
You must use the `--listen` option when starting Neovim. You have a couple of options:
- directly from the terminal when invoking the program: `nvim --listen /tmp/nvim`
- attach the instance to the socket at startup from your Neovim config:
  ```lua
  -- init.lua
  vim.fn.serverstart("/tmp/nvim")
  ```
- If you run multiple Neovim instances, add a toggle keymap — it lets you change which instance the MCP server talks to:
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


### 2. Build the server
This server is so simple that downloading a release is not worth it.
You can just clone this repo and build the JS files with the following:
```bash
npm install && npm run build
```

### 3. Register the server with your MCP client
Depending on your agent harness of choice this step might look different:
- for Claude Code:
  ```bash
  claude mcp add --transport stdio --scope user neovim-nav -- node /path/to/neovim-mcp/build/index.js
  ```
- for other clients (Cursor, etc.):
  add this to your MCP config file
  ```json
  {
    "neovim-nav": {
      "type": "stdio",
      "command": "node",
      "args": ["/path/to/neovim-mcp/build/index.js"]
    }
  }

### 3.1. Custom socket
The server connects to `/tmp/nvim` by default. To use a different socket path specify the env variable `NVIM_SOCKET_PATH`:
- Claude code:
  ```bash
  claude mcp add --transport stdio --scope user neovim-nav -e NVIM_SOCKET_PATH=/tmp/my-nvim -- node /path/to/neovim-mcp/build/index.js
  ```
- other clients: 
  ```json
  {
    "neovim-nav": {
      "type": "stdio",
      "command": "node",
      "args": ["/path/to/neovim-mcp/build/index.js"],
      "env": { "NVIM_SOCKET_PATH": "/tmp/custom-nvim-socket" }
    }
  }
  ```
Remember to connect both your server and Neovim instance to the same socket:
`nvim --listen /tmp/custom-nvim-socket`


## Tools

| Tool | Description |
|---|---|
| `get_document_symbols` | File outline via LSP (with optional name filter) |
| `get_ast_context` | Treesitter Abstract syntaxt tree at a cursor position |
| `search_symbols` | Workspace-wide symbol search via LSP |
| `get_diagnostics` | LSP errors/warnings for a file or workspace |
| `get_references` | Find all usages of a symbol |
| `goto_definition` | Jump to where a symbol is defined |
| `goto_implementation` | Find implementations of an interface/abstract method |
| `hover` | Type signature and docs at a position for a symbol |
| `get_quickfix` / `set_quickfix` | Read/write the Neovim quickfix list |
| `restart_lsp` | Restart LSP clients (useful after external file changes) |
| `get_lsp` | get active LSP clients |
| `vim_health` | Check connection with the Neovim instance |

## Contributing

See [src/README.md](src/README.md) for project structure and how to add new tools.
