import { attach, Neovim } from "neovim";
import { string } from "zod/v4";

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

  // Creates a fresh connection per call — stateless to avoid stale socket handles
  private async connect(): Promise<Neovim> {
    const socketPath = this.getSocketPath();
    try {
      return attach({ socket: socketPath });
    } catch {
      throw new Error(`Cannot connect to Neovim at ${socketPath}`);
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

  async callLuaFunction<T>(
    code: string,
    args: (string | number | undefined)[] = [],
  ): Promise<T> {
    // throw new Error("SERVER CODE:  " + code);
    try {
      const nvim = await this.connect();
      const formattedArgs = args
        .map((arg) => (typeof arg === "string" ? `"${arg}"` : arg))
        .join(",")
        .replaceAll(/,$/gm, ""); //remove trailing ","
      return (await nvim.lua(`${code}(${formattedArgs})`)) as T;
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
