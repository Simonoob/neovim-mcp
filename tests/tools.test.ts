import { McpServer } from "@modelcontextprotocol/sdk/server/mcp";
import { describe, it, expect, vi } from "vitest";
import { registerTools } from "../src/tools.js";
import { NeovimClient } from "../src/neovim.js";

// Helper to capture registered tool handlers
function createMockServer() {
  const handlers: Map<string, Function> = new Map();
  const configs: Map<string, any> = new Map();

  const mockServer = {
    registerTool: vi.fn((name: string, config: any, handler: Function) => {
      handlers.set(name, handler);
      configs.set(name, config);
    }),
    server: {
      getClientCapabilities: vi.fn(() => ({})),
      notification: vi.fn(),
    },
    sendLoggingMessage: vi.fn(),
    sendResourceUpdated: vi.fn(),
  } as unknown as McpServer;

  return { mockServer, handlers, configs };
}

describe("Tools", () => {
  it("vim_health", async () => {
    const { mockServer, handlers } = createMockServer();

    //NOTE:: you should start the nvim instance in `src/index.ts`

    //TODO:
    //- create proper test fixtures: TS files to analyze
    //- set a special socket name for tests
    //- start neovim in headless mode in the fixtures entrypoint file
    const nvimClient = NeovimClient.getInstance();

    registerTools(mockServer, nvimClient);

    const handler = handlers.get("vim_health")!;
    const result = await handler();

    expect(result).toStrictEqual({
      content: [{ type: "text", text: "Neovim connection is healthy." }],
    });
  });

  it("restart_lsp", async () => {
    const { mockServer, handlers } = createMockServer();
    let nvimClient = NeovimClient.getInstance();

    registerTools(mockServer, nvimClient);

    const handler = handlers.get("restart_lsp")!;
    const result = await handler();

    expect(result.content[0].text).toMatch("Stopped:");
    expect(result.content[0].text).toMatch("Started:");
  });

  it("get_document_symbols", async () => {
    const { mockServer, handlers } = createMockServer();
    let nvimClient = NeovimClient.getInstance();

    registerTools(mockServer, nvimClient);

    const handler = handlers.get("get_document_symbols")!;
    const result = await handler();
    //TODO: check results
  });
});
