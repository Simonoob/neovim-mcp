import { attach, Neovim } from "neovim";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type LuaArg = any;

export class NeovimClient {
  private static instance: NeovimClient;
  private constructor() {}

  static getInstance(): NeovimClient {
    if (!NeovimClient.instance) NeovimClient.instance = new NeovimClient();
    return NeovimClient.instance;
  }

  private getSocketPath(): string {
    return process.env.NVIM_SOCKET_PATH || "/tmp/nvim";
  }

  private async connect(): Promise<Neovim> {
    const socketPath = this.getSocketPath();
    try {
      return attach({ socket: socketPath });
    } catch {
      throw new Error(
        `Cannot connect to Neovim at ${socketPath}. Is it running with --listen ${socketPath}?`,
      );
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
      throw new Error(
        `Neovim: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  async getCwd(): Promise<string> {
    const nvim = await this.connect();
    return String(await nvim.call("getcwd"));
  }
}
