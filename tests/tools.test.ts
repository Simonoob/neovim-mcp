import { McpServer } from "@modelcontextprotocol/sdk/server/mcp";
import { describe, it, expect, vi, beforeAll, afterAll } from "vitest";
import { registerTools } from "../src/tools.js";
import { NeovimClient } from "../src/neovim.js";
import { exec, spawn } from "node:child_process";

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
  let nvimProcess: ReturnType<typeof spawn> | undefined = undefined;
  beforeAll(async () => {
    //cleanup socket
    exec("rm -rf /tmp/nvim-mcp-test");

    nvimProcess = spawn("nvim", [
      "--listen",
      "/tmp/nvim-mcp-test",
      "--headless",
      "./tests/fixtures/typescript/index.ts",
    ]);
    // await nvim startup and LSP init
    await new Promise((resolve) => setTimeout(resolve, 5000));

    nvimProcess?.stdout?.on("data", (data) => {
      console.warn(`Neovim info: ${data}`);
    });

    nvimProcess?.stderr?.on("data", (data) => {
      console.error(`Neovim error: ${data}`);
    });
  });
  afterAll(() => {
    nvimProcess?.kill();

    //cleanup socket
    exec("rm -rf /tmp/nvim-mcp-test");
  });

  it("vim_health", async () => {
    const { mockServer, handlers } = createMockServer();
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

  // it("get_document_symbols", async () => {
  //   const { mockServer, handlers } = createMockServer();
  //   let nvimClient = NeovimClient.getInstance();
  //
  //   registerTools(mockServer, nvimClient);
  //
  //   const handler = handlers.get("get_document_symbols")!;
  //   console.log({ handler });
  //   const result = await handler("./fixtures/typescript/index.ts");
  //   //TODO: check results
  //   expect(result).toBe("bau");
  // });

  // it("workspace_symbols", async () => {
  //   const { mockServer, handlers } = createMockServer();
  //   let nvimClient = NeovimClient.getInstance();
  //
  //   registerTools(mockServer, nvimClient);
  //
  //   const handler = handlers.get("workspace_symbols")!;
  //   const result = await handler("main");
  //   //TODO: check results
  //   expect(result).toBe("miao");
  // });
});
