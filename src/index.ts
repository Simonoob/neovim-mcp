#!/usr/bin/env node

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { NeovimClient } from "./neovim.js";
import { registerTools } from "./tools.js";

const server = new McpServer({ name: "neovim-mcp", version: "0.1.0" });
const nvim = NeovimClient.getInstance();

registerTools(server, nvim);

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((error) => {
  console.error("Server error:", error);
  process.exit(1);
});
