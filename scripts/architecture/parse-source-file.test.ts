import ts from 'typescript';
import { describe, expect, it } from 'vitest';
import {
  collectParseDiagnostics,
  parseSourceFile,
  SourceParseError,
  scriptKindFor,
} from './parse-source-file';

describe('parseSourceFile', () => {
  it('returns the source file for input that parses', () => {
    const source = parseSourceFile(
      'ok.ts',
      'export const value: number = 1;\n',
    );

    expect(source.fileName).toBe('ok.ts');
    expect(collectParseDiagnostics(source)).toEqual([]);
  });

  it('throws instead of letting a guard vouch for a file it cannot read', () => {
    // A call opened with `(` and closed with `}` — the shape a bad refactor
    // leaves behind. ts.createSourceFile returns a best-effort tree here, so a
    // guard walking it finds nothing and reports the file clean.
    const broken = [
      'const rows = await prisma.post.findMany({',
      '  where: scopedWhere(orgId, {',
      '    isPublished: true,',
      '  },',
      '  select: { id: true },',
      '});',
    ].join('\n');

    expect(() => parseSourceFile('broken.ts', broken)).toThrow(
      SourceParseError,
    );
    try {
      parseSourceFile('broken.ts', broken);
    } catch (error) {
      expect(error).toBeInstanceOf(SourceParseError);
      const parseError = error as SourceParseError;
      expect(parseError.filePath).toBe('broken.ts');
      expect(parseError.diagnostics.length).toBeGreaterThan(0);
      expect(parseError.message).toContain('broken.ts');
    }
  });

  it('honours an explicit script kind so TSX still parses', () => {
    const source = parseSourceFile(
      'component.tsx',
      'export const node = <div className="x">hi</div>;\n',
      true,
      ts.ScriptKind.TSX,
    );

    expect(collectParseDiagnostics(source)).toEqual([]);
  });

  it('reports a generic parameter as broken JSX when the script kind is wrong', () => {
    expect(() =>
      parseSourceFile(
        'component.tsx',
        'export const node = <div className="x">hi</div>;\n',
        true,
        ts.ScriptKind.TS,
      ),
    ).toThrow(SourceParseError);
  });
});

describe('scriptKindFor', () => {
  it.each([
    ['module.ts', ts.ScriptKind.TS],
    ['component.tsx', ts.ScriptKind.TSX],
    ['legacy.jsx', ts.ScriptKind.JSX],
    ['script.js', ts.ScriptKind.JS],
    ['script.mjs', ts.ScriptKind.JS],
  ])('resolves %s from its extension', (filePath, expected) => {
    expect(scriptKindFor(filePath)).toBe(expected);
  });

  it('lets a .ts file with a generic parameter parse', () => {
    // Guards used to force TSX on every file, which reads `<T,>` as an
    // unclosed JSX tag: the file misparsed and the guard saw nothing.
    const source = 'export const identity = <T,>(value: T): T => value;\n';

    expect(() =>
      parseSourceFile('hook.ts', source, true, ts.ScriptKind.TSX),
    ).toThrow(SourceParseError);
    expect(
      collectParseDiagnostics(
        parseSourceFile('hook.ts', source, true, scriptKindFor('hook.ts')),
      ),
    ).toEqual([]);
  });
});
