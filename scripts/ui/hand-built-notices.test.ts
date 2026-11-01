import ts from 'typescript';
import { describe, expect, it } from 'vitest';
import notices from './hand-built/areas/notices';
import type { HandBuiltSource } from './hand-built/core';

function scan(body: string, file = 'apps/web/src/Example.tsx') {
  const text = `export const A = () => (\n  <>\n${body}\n  </>\n);\n`;
  const source: HandBuiltSource = {
    file,
    sourceFile: ts.createSourceFile(
      file,
      text,
      ts.ScriptTarget.Latest,
      true,
      ts.ScriptKind.TSX,
    ),
    text,
  };
  return notices
    .scan(source)
    .map((finding) => `${finding.rule}:${finding.line}`);
}

describe('notices guard', () => {
  it.each([
    [
      'soft tone, no border',
      'rounded-lg bg-destructive/10 px-4 py-2.5 text-sm text-destructive',
    ],
    [
      'tone with border',
      'rounded border border-warning/20 bg-warning/10 px-3 py-2 text-sm text-warning',
    ],
    ['raw palette tone', 'space-y-4 rounded-md bg-emerald-500/5 p-4'],
    ['conditional tone', 'rounded-2xl p-4 bg-success/10 shadow-border'],
  ])('flags a hand-built tone box: %s', (_name, classes) => {
    expect(scan(`    <div className="${classes}">Failed</div>`)).toEqual([
      'notice-tone-box:3',
    ]);
  });

  it.each([
    [
      'muted wash',
      'rounded bg-muted/50 px-2 py-1 text-2xs text-muted-foreground',
    ],
    [
      'foreground wash',
      'rounded bg-foreground/5 px-3 py-2 text-xs text-foreground/70',
    ],
  ])('flags a hand-built note strip: %s', (_name, classes) => {
    expect(scan(`    <p className="${classes}">Heads up</p>`)).toEqual([
      'notice-note:3',
    ]);
  });

  it('reads classes through cn() and local constants', () => {
    const text = `const SURFACE = 'rounded-lg bg-warning/10 px-3 py-2';
export const A = () => <div className={cn(SURFACE, 'text-sm')}>Heads up</div>;
`;
    const source: HandBuiltSource = {
      file: 'apps/web/src/Example.tsx',
      sourceFile: ts.createSourceFile(
        'apps/web/src/Example.tsx',
        text,
        ts.ScriptTarget.Latest,
        true,
        ts.ScriptKind.TSX,
      ),
      text,
    };
    expect(notices.scan(source)).toHaveLength(1);
  });

  it.each([
    ['hover wash only', 'rounded px-3 py-2 hover:bg-destructive/10'],
    ['a pill', 'inline-flex rounded-md bg-success/10 px-2 py-0.5 text-xs'],
    ['no radius or padding', 'bg-destructive/10 text-destructive'],
    [
      'neutral card with large text',
      'rounded-lg bg-muted px-3 py-2 text-sm text-foreground',
    ],
  ])('does not flag %s', (_name, classes) => {
    expect(scan(`    <div className="${classes}">Row</div>`)).toEqual([]);
  });

  it('does not flag a clickable element', () => {
    expect(
      scan(
        '    <div onClick={go} className="rounded-lg bg-destructive/10 px-3 py-2">Row</div>',
      ),
    ).toEqual([]);
  });

  it('honours ui-guard-allow with a reason, and only with a reason', () => {
    const classes = 'rounded-lg bg-warning/10 px-3 py-2';
    expect(
      scan(
        `    {/* ui-guard-allow:notice-tone-box -- tinted panel, not a notice */}\n    <div className="${classes}">A</div>`,
      ),
    ).toEqual([]);
    expect(
      scan(
        `    {/* ui-guard-allow:notice-tone-box */}\n    <div className="${classes}">A</div>`,
      ),
    ).toEqual(['notice-tone-box:4']);
  });

  it('is not silenced by the design-system content-colour comment', () => {
    expect(
      scan(
        '    {/* design-system-allow-content-color */}\n    <div className="rounded-lg bg-warning/10 px-3 py-2">A</div>',
      ),
    ).toEqual(['notice-tone-box:4']);
  });

  it('ignores the shared package itself', () => {
    expect(
      scan(
        '    <div className="rounded-lg bg-warning/10 px-3 py-2">A</div>',
        'packages/ui/src/primitives/example.tsx',
      ),
    ).toEqual([]);
  });
});
