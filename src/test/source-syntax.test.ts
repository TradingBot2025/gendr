import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import ts from "typescript";
import { describe, expect, it } from "vitest";

function sourceFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return sourceFiles(path);
    return /\.tsx?$/.test(path) ? [path] : [];
  });
}

describe("Application syntax", () => {
  it.each(sourceFiles("src"))("parses %s without syntax errors", (path) => {
    const source = readFileSync(path, "utf8");
    const result = ts.transpileModule(source, {
      fileName: path,
      reportDiagnostics: true,
      compilerOptions: { jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022 },
    });
    const errors = (result.diagnostics ?? [])
      .filter((diagnostic) => diagnostic.category === ts.DiagnosticCategory.Error)
      .map((diagnostic) => ts.flattenDiagnosticMessageText(diagnostic.messageText, "\n"));
    expect(errors).toEqual([]);
  });
});
