import { execSync } from "node:child_process";
import { formatFileList } from "../formatters.js";

function shellEscape(str: string): string {
  return "'" + str.replace(/'/g, "'\\''") + "'";
}

export async function fuzzyFindFiles(
  query: string,
  cwd: string
): Promise<string> {
  try {
    const result = execSync(
      `rg --files --color never -g '!.git' -g '!node_modules' | fzf --filter=${shellEscape(query)} | head -20`,
      {
        cwd,
        encoding: "utf-8",
        timeout: 5000,
        stdio: ["pipe", "pipe", "pipe"],
      }
    );
    const files = result
      .trim()
      .split("\n")
      .filter((f) => f.length > 0);
    return formatFileList(files, query);
  } catch (error) {
    // fzf returns exit code 1 when no matches, and execSync throws
    if (
      error instanceof Error &&
      "status" in error &&
      (error as NodeJS.ErrnoException & { status: number }).status === 1
    ) {
      return formatFileList([], query);
    }
    throw error;
  }
}
