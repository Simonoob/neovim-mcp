import { McpServer } from "@modelcontextprotocol/sdk/server/mcp";
import { describe, expect, vi, beforeAll, afterAll, test } from "vitest";
import { registerTools } from "../src/tools.js";
import { NeovimClient } from "../src/neovim.js";
import { exec, spawn } from "node:child_process";
import { getProjectRoot } from "../src/utils.js";

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
    await new Promise((resolve) => setTimeout(resolve, 3000));

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

  test("vim_health", async () => {
    const { mockServer, handlers } = createMockServer();
    const nvimClient = NeovimClient.getInstance();

    registerTools(mockServer, nvimClient);

    const handler = handlers.get("vim_health")!;
    const result = await handler();

    expect(result).toStrictEqual({
      content: [{ type: "text", text: "Neovim connection is healthy." }],
    });
  });

  test("restart_lsp", async () => {
    const { mockServer, handlers } = createMockServer();
    let nvimClient = NeovimClient.getInstance();

    registerTools(mockServer, nvimClient);

    const handler = handlers.get("restart_lsp")!;
    const result = await handler();

    expect(result.content[0].text).toMatch("Stopped:");
    expect(result.content[0].text).toMatch("Started:");
  });

  test("go_to_definition", async () => {
    const { mockServer, handlers } = createMockServer();
    let nvimClient = NeovimClient.getInstance();

    registerTools(mockServer, nvimClient);

    const handler = handlers.get("goto_definition")!;
    const filepath = `${await getProjectRoot()}/tests/fixtures/typescript/index.ts`;
    const result = await handler({
      file: filepath,
      line: 9,
      col: 1, // `main` function call
    });

    expect(result.content[0].text).toMatch(
      `Definition from tests/fixtures/typescript/index.ts:9:1:

  tests/fixtures/typescript/index.ts:4:14`,
    );
  });

  test("get_document_symbols", async () => {
    const { mockServer, handlers } = createMockServer();
    let nvimClient = NeovimClient.getInstance();

    registerTools(mockServer, nvimClient);

    const handler = handlers.get("get_document_symbols")!;
    const filepath = `${await getProjectRoot()}/tests/fixtures/typescript/index.ts`;
    const result = await handler({
      file: filepath,
    });

    expect(result.content[0].text).toMatch(
      `# tests/fixtures/typescript/index.ts
[Constant] main (L4-7)
  [Constant] variable (L5-5)`,
    );
  });

  test("get_ast_context", async () => {
    const { mockServer, handlers } = createMockServer();
    let nvimClient = NeovimClient.getInstance();

    registerTools(mockServer, nvimClient);

    const handler = handlers.get("get_ast_context")!;
    const filepath = `${await getProjectRoot()}/tests/fixtures/typescript/index.ts`;
    const result = await handler({
      file: filepath,
      line: 5,
    });

    expect(result.content[0].text)
      .toMatch(`AST context at tests/fixtures/typescript/index.ts:5:
  program (L1)
    lexical_declaration (L4)
      variable_declarator "main" (L4)
        arrow_function (L4)
          statement_block (L4) <-- here`);
  });

  // TODO: figure this timeout out
  // test("workspace_symbols", async () => {
  //   const { mockServer, handlers } = createMockServer();
  //   let nvimClient = NeovimClient.getInstance();
  //
  //   registerTools(mockServer, nvimClient);
  //
  //   const handler = handlers.get("workspace_symbols")!;
  //   const result = await handler("main");
  //   //TODO: check results
  //   expect(result).toBe("miao");
  // }, 20000);

  test("get_diagnostics", async () => {
    const { mockServer, handlers } = createMockServer();
    let nvimClient = NeovimClient.getInstance();

    registerTools(mockServer, nvimClient);

    const handler = handlers.get("get_diagnostics")!;
    const filepath = `${await getProjectRoot()}/tests/fixtures/typescript/index.ts`;
    const result = await handler({
      file: filepath,
    });

    expect(result.content[0].text)
      .toMatch(`1 diagnostics (file: tests/fixtures/typescript/index.ts):

  L11:7  HINT  [tsserver] 'unusedVar' is declared but its value is never read. (6133)`);

    const resultWithSeverity = await handler({
      file: filepath,
      severity: "hint",
    });

    expect(resultWithSeverity.content[0].text)
      .toMatch(`1 diagnostics (file: tests/fixtures/typescript/index.ts):

  L11:7  HINT  [tsserver] 'unusedVar' is declared but its value is never read. (6133)`);
  });

  test("hover", async () => {
    const { mockServer, handlers } = createMockServer();
    let nvimClient = NeovimClient.getInstance();

    registerTools(mockServer, nvimClient);

    const handler = handlers.get("hover")!;
    const filepath = `${await getProjectRoot()}/tests/fixtures/typescript/index.ts`;
    const result = await handler({
      file: filepath,
      line: 9,
      col: 1, // `main` function call
    });
    expect(result.content[0].text).toMatch(
      "Hover at tests/fixtures/typescript/index.ts:9:1:",
    );
    expect(result.content[0].text).toMatch("const main: () => string");
    expect(result.content[0].text).toMatch("the main function");
  });

  test("get_references", async () => {
    const { mockServer, handlers } = createMockServer();
    let nvimClient = NeovimClient.getInstance();

    registerTools(mockServer, nvimClient);

    const handler = handlers.get("get_references")!;
    const filepath = `${await getProjectRoot()}/tests/fixtures/typescript/index.ts`;
    const result = await handler({
      file: filepath,
      line: 9,
      col: 1, // `main` function call
    });
    expect(result.content[0].text).toMatch("2 references");
    expect(result.content[0].text).toMatch(
      "tests/fixtures/typescript/index.ts:4:7 -- const main = () => {",
    );
    expect(result.content[0].text).toMatch(
      "tests/fixtures/typescript/index.ts:9:1 -- main();",
    );
  });

  test("goto_implementation", async () => {
    const { mockServer, handlers } = createMockServer();
    let nvimClient = NeovimClient.getInstance();

    registerTools(mockServer, nvimClient);

    const handler = handlers.get("goto_implementation")!;
    const filepath = `${await getProjectRoot()}/tests/fixtures/typescript/index.ts`;
    const result = await handler({
      file: filepath,
      line: 9,
      col: 1, // `main` function call
    });
    expect(result.content[0].text).toMatch("1 implementations");
    expect(result.content[0].text).toMatch(
      "tests/fixtures/typescript/index.ts:4:7",
    );
  });
});
