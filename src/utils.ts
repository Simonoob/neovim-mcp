import { execSync } from "node:child_process";

export function toolResult(text: string) {
  return { content: [{ type: "text" as const, text }] };
}

export function toolError(error: unknown) {
  const msg = error instanceof Error ? error.message : String(error);
  return { content: [{ type: "text" as const, text: `Error: ${msg}` }] };
}

export function relativePath(filePath: string, cwd: string): string {
  if (filePath.startsWith(cwd + "/")) return filePath.slice(cwd.length + 1);
  if (filePath.startsWith(cwd)) return filePath.slice(cwd.length);
  return filePath;
}

export function shellEscape(s: string): string {
  return "'" + s.replace(/'/g, "'\\''") + "'";
}

export function execSafe(cmd: string, cwd: string, timeout: number): string {
  try {
    return execSync(cmd, {
      cwd,
      encoding: "utf-8",
      timeout,
      stdio: ["pipe", "pipe", "pipe"],
    });
  } catch (error) {
    if ((error as { status?: number })?.status === 1) return "";
    throw error;
  }
}
