import ts from 'typescript';

/**
 * Every AST guard in this repository reads its input with
 * `ts.createSourceFile`, which never throws: a file it cannot parse comes back
 * as a best-effort tree with the malformed region dropped. A guard walking that
 * tree finds nothing and reports the file clean, so a syntax error silently
 * turns a guard into a no-op for that file — including the tenant-scope and
 * cross-org guards. Lint catches the syntax error separately, but only after
 * the guard has already claimed the file is fine.
 *
 * `parseSourceFile` is the same call with the parse diagnostics actually read.
 */
export class SourceParseError extends Error {
  constructor(
    readonly filePath: string,
    readonly diagnostics: ReadonlyArray<{ line: number; message: string }>,
  ) {
    const detail = diagnostics
      .map(({ line, message }) => `  ${filePath}:${line} ${message}`)
      .join('\n');
    super(
      `Could not parse ${filePath}; a guard cannot vouch for it:\n${detail}`,
    );
    this.name = 'SourceParseError';
  }
}

/** Parse diagnostics are on the node but absent from the public type. */
type ParsedSourceFile = ts.SourceFile & {
  parseDiagnostics?: ts.DiagnosticWithLocation[];
};

export function collectParseDiagnostics(
  sourceFile: ts.SourceFile,
): Array<{ line: number; message: string }> {
  const parsed = (sourceFile as ParsedSourceFile).parseDiagnostics ?? [];
  return parsed.map((diagnostic) => ({
    line:
      sourceFile.getLineAndCharacterOfPosition(diagnostic.start ?? 0).line + 1,
    message: ts.flattenDiagnosticMessageText(diagnostic.messageText, ' '),
  }));
}

/**
 * Creates a source file and throws `SourceParseError` when it does not parse,
 * so a guard fails loudly instead of reporting a file it could not read as
 * clean. `setParentNodes` matches what the guards already pass.
 */
export function parseSourceFile(
  filePath: string,
  sourceText: string,
  setParentNodes = true,
  scriptKind?: ts.ScriptKind,
): ts.SourceFile {
  const sourceFile = ts.createSourceFile(
    filePath,
    sourceText,
    ts.ScriptTarget.Latest,
    setParentNodes,
    scriptKind,
  );
  const diagnostics = collectParseDiagnostics(sourceFile);
  if (diagnostics.length > 0) {
    throw new SourceParseError(filePath, diagnostics);
  }
  return sourceFile;
}
