import { attach, Neovim } from "neovim";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type LuaArg = any;

export class NeovimConnectionError extends Error {
  constructor(socketPath: string, cause?: Error) {
    super(
      `Failed to connect to Neovim at ${socketPath}. Is Neovim running with --listen ${socketPath}?`
    );
    this.name = "NeovimConnectionError";
    this.cause = cause;
  }
}

export class NeovimCommandError extends Error {
  constructor(operation: string, originalError: string) {
    super(`Failed to execute '${operation}': ${originalError}`);
    this.name = "NeovimCommandError";
  }
}

export class NeovimClient {
  private static instance: NeovimClient;

  private constructor() {}

  static getInstance(): NeovimClient {
    if (!NeovimClient.instance) {
      NeovimClient.instance = new NeovimClient();
    }
    return NeovimClient.instance;
  }

  private getSocketPath(): string {
    return process.env.NVIM_SOCKET_PATH || "/tmp/nvim";
  }

  private async connect(): Promise<Neovim> {
    const socketPath = this.getSocketPath();
    try {
      return attach({ socket: socketPath });
    } catch (error) {
      throw new NeovimConnectionError(socketPath, error as Error);
    }
  }

  async healthCheck(): Promise<boolean> {
    try {
      const nvim = await this.connect();
      await nvim.eval("1");
      return true;
    } catch {
      return false;
    }
  }

  async lua<T>(code: string, args: LuaArg[] = []): Promise<T> {
    const nvim = await this.connect();
    try {
      return (await nvim.lua(code, args)) as T;
    } catch (error) {
      throw new NeovimCommandError(
        "lua",
        error instanceof Error ? error.message : String(error)
      );
    }
  }

  async getCwd(): Promise<string> {
    const nvim = await this.connect();
    return String(await nvim.call("getcwd"));
  }

  async ensureFileOpen(filePath: string): Promise<number> {
    return this.lua<number>(
      `
      local filepath = ...
      local bufnr = vim.fn.bufadd(filepath)
      vim.fn.bufload(bufnr)
      return bufnr
      `,
      [filePath]
    );
  }
}
