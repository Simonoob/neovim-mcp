interface OutlineEntry {
  kind: string;
  name: string;
  line: number;
  end_line: number;
  signature: string;
  children: OutlineEntry[];
}

interface SymbolResult {
  name: string;
  kind: string;
  file: string;
  line: number;
  col: number;
}

interface DiagnosticResult {
  file: string;
  line: number;
  col: number;
  severity: string;
  message: string;
  source: string;
  code: string | number;
}

interface ReferenceResult {
  file: string;
  line: number;
  col: number;
  text: string;
}

interface QuickfixItem {
  file: string;
  line: number;
  col: number;
  text: string;
  type: string;
}

interface ScopeNode {
  type: string;
  name: string | null;
  line: number;
}

export type {
  OutlineEntry,
  SymbolResult,
  DiagnosticResult,
  ReferenceResult,
  QuickfixItem,
  ScopeNode,
};

function relativePath(filePath: string, cwd: string): string {
  if (filePath.startsWith(cwd)) {
    const rel = filePath.slice(cwd.length);
    return rel.startsWith("/") ? rel.slice(1) : rel;
  }
  return filePath;
}

export function formatOutline(
  entries: OutlineEntry[],
  file: string,
  cwd: string,
  depth = 0,
): string {
  if (!entries || entries.length === 0) return "No symbols found.";

  const lines: string[] = [];
  if (depth === 0) {
    lines.push(`# ${relativePath(file, cwd)}`);
  }

  const indent = "  ".repeat(depth + 1);
  for (const entry of entries) {
    lines.push(
      `${indent}[${entry.kind}] ${entry.name} (L${entry.line}-${entry.end_line})`,
    );
    if (entry.signature) {
      lines.push(`${indent}  signature: ${entry.signature}`);
    }
    if (entry.children && entry.children.length > 0) {
      lines.push(formatOutline(entry.children, file, cwd, depth + 1));
    }
  }

  return lines.join("\n");
}

export function formatSymbols(
  symbols: SymbolResult[],
  query: string,
  cwd: string,
): string {
  if (!symbols || symbols.length === 0)
    return `No symbols found matching "${query}".`;

  const lines = [`Found ${symbols.length} symbols matching "${query}":\n`];
  for (const sym of symbols) {
    lines.push(
      `  [${sym.kind}] ${sym.name} -- ${relativePath(sym.file, cwd)}:${sym.line}:${sym.col}`,
    );
  }
  return lines.join("\n");
}

export function formatDiagnostics(
  diags: DiagnosticResult[],
  file: string | undefined,
  cwd: string,
): string {
  if (!diags || diags.length === 0) {
    const scope = file ? ` (file: ${relativePath(file, cwd)})` : "";
    return `No diagnostics${scope}.`;
  }

  const scope = file ? ` (file: ${relativePath(file, cwd)})` : "";
  const lines = [`${diags.length} diagnostics${scope}:\n`];
  for (const d of diags) {
    const filePrefix = file ? "" : `${relativePath(d.file, cwd)}:`;
    const src = d.source ? `[${d.source}] ` : "";
    const code = d.code ? ` (${d.code})` : "";
    lines.push(
      `  ${filePrefix}L${d.line}:${d.col}  ${d.severity}  ${src}${d.message}${code}`,
    );
  }
  return lines.join("\n");
}

export function formatReferences(
  refs: ReferenceResult[],
  symbol: string,
  cwd: string,
): string {
  if (!refs || refs.length === 0) return `No references found for "${symbol}".`;

  const lines = [`${refs.length} references to "${symbol}":\n`];
  for (const ref of refs) {
    const text = ref.text ? ` -- ${ref.text.trim()}` : "";
    lines.push(
      `  ${relativePath(ref.file, cwd)}:${ref.line}:${ref.col}${text}`,
    );
  }
  return lines.join("\n");
}

export function formatQuickfix(
  title: string,
  items: QuickfixItem[],
  cwd: string,
): string {
  if (!items || items.length === 0) return "Quickfix list is empty.";

  const header = title ? `Quickfix: ${title}` : "Quickfix list";
  const lines = [`${header} (${items.length} items):\n`];
  for (const item of items) {
    const type = item.type ? `[${item.type}] ` : "";
    lines.push(
      `  ${relativePath(item.file, cwd)}:${item.line}:${item.col}  ${type}${item.text.trim()}`,
    );
  }
  return lines.join("\n");
}

export function formatScopeChain(
  chain: ScopeNode[],
  file: string,
  line: number,
  cwd: string,
): string {
  if (!chain || chain.length === 0) return "No AST context at this position.";

  const lines = [`AST context at ${relativePath(file, cwd)}:${line}:\n`];
  const lastIdx = chain.length - 1;
  for (let i = 0; i < chain.length; i++) {
    const node = chain[i];
    const indent = "  ".repeat(i + 1);
    const marker = i === lastIdx ? " <-- here" : "";
    const name = node.name ? ` "${node.name}"` : "";
    lines.push(`${indent}${node.type}${name} (L${node.line})${marker}`);
  }
  return lines.join("\n");
}

export function formatFileList(files: string[], query: string): string {
  if (!files || files.length === 0)
    return `No files found matching "${query}".`;

  const lines = [`Files matching "${query}":\n`];
  for (const f of files) {
    lines.push(`  ${f}`);
  }
  return lines.join("\n");
}

export function formatGrepResults(
  output: string,
  query: string,
  glob?: string,
): string {
  if (!output || output.trim().length === 0)
    return `No matches found for "${query}"${glob ? ` in ${glob}` : ""}.`;

  const scope = glob ? ` in ${glob}` : "";
  return `Matches for "${query}"${scope}:\n\n${output.trim()}`;
}
