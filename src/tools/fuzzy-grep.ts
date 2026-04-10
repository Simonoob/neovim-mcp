import { execSync } from "node:child_process";
import { formatGrepResults } from "../formatters.js";

function shellEscape(str: string): string {
  return "'" + str.replace(/'/g, "'\\''") + "'";
}

export async function fuzzyGrep(
  query: string,
  cwd: string,
  glob?: string
): Promise<string> {
  try {
    const globArg = glob ? `-g ${shellEscape(glob)}` : "";
    const result = execSync(
      `rg --color never --line-number --no-heading --max-count 5 --max-columns 200 ${globArg} -g '!.git' -g '!node_modules' ${shellEscape(query)} | head -30`,
      {
        cwd,
        encoding: "utf-8",
        timeout: 10000,
        stdio: ["pipe", "pipe", "pipe"],
      }
    );
    return formatGrepResults(result, query, glob);
  } catch (error) {
    // rg returns exit code 1 when no matches
    if (
      error instanceof Error &&
      "status" in error &&
      (error as NodeJS.ErrnoException & { status: number }).status === 1
    ) {
      return formatGrepResults("", query, glob);
    }
    throw error;
  }
}
