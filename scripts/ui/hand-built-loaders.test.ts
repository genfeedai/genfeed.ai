import ts from 'typescript';
import { describe, expect, it } from 'vitest';
import definitionList from './hand-built/areas/definition-list';
import emptyState from './hand-built/areas/empty-state';
import loading from './hand-built/areas/loading';
import metric from './hand-built/areas/metric';
import table from './hand-built/areas/table';
import type { HandBuiltArea, HandBuiltSource } from './hand-built/core';

function scan(area: HandBuiltArea, text: string, file = 'apps/web/src/A.tsx') {
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
  return area.scan(source).map((finding) => finding.rule);
}

describe('empty-state guard', () => {
  it('flags a centred muted block with vertical padding', () => {
    expect(
      scan(
        emptyState,
        'export const A = () => <div className="text-center py-8 text-muted-foreground">Nothing</div>;',
      ),
    ).toEqual(['empty-state-hand-built']);
  });

  it('flags a local component that redefines the shared empty state', () => {
    expect(scan(emptyState, 'function EmptyState() { return null; }')).toEqual([
      'empty-state-duplicate',
    ]);
  });

  it('flags padding overrides on the shared EmptyState', () => {
    expect(
      scan(
        emptyState,
        'import { EmptyState } from \'@ui/primitives/empty-state\';\nexport const A = () => <EmptyState className="py-0" title="x" />;',
      ),
    ).toEqual(['empty-state-restyle']);
  });

  it('allows layout classes and the shared component itself', () => {
    expect(
      scan(
        emptyState,
        'import { EmptyState } from \'@ui/primitives/empty-state\';\nexport const A = () => <EmptyState className="h-full" title="x" />;',
      ),
    ).toEqual([]);
    expect(
      scan(
        emptyState,
        'function EmptyState() { return null; }',
        'packages/ui/src/primitives/empty-state.tsx',
      ),
    ).toEqual([]);
  });

  it('honours the allow comment only with a reason', () => {
    const block =
      '<div className="text-center py-8 text-muted-foreground">x</div>';
    expect(
      scan(
        emptyState,
        `// ui-guard-allow:empty-state-hand-built -- feature owns this look\nexport const A = () => ${block};`,
      ),
    ).toEqual([]);
    expect(
      scan(
        emptyState,
        `// ui-guard-allow:empty-state-hand-built\nexport const A = () => ${block};`,
      ),
    ).toEqual(['empty-state-hand-built']);
  });
});

describe('metric guard', () => {
  it('flags a small label above a large bold value', () => {
    expect(
      scan(
        metric,
        'export const A = () => <div><p className="text-xs uppercase">Views</p><p className="text-2xl font-semibold">4</p></div>;',
      ),
    ).toEqual(['metric-hand-built']);
  });

  it('flags a restyled MetricCard but not layout classes', () => {
    const header =
      "import MetricCard from '@ui/cards/metric-card/MetricCard';\n";
    expect(
      scan(
        metric,
        `${header}export const A = () => <MetricCard className="p-6 text-3xl" label="a" value="1" />;`,
      ),
    ).toEqual(['metric-card-restyle']);
    expect(
      scan(
        metric,
        `${header}export const A = () => <MetricCard className="w-full" label="a" value="1" />;`,
      ),
    ).toEqual([]);
  });
});

describe('table guard', () => {
  it('flags padding and typography on cells', () => {
    expect(
      scan(
        table,
        'import { TableCell } from \'@ui/primitives/table\';\nexport const A = () => <TableCell className="px-4 py-3 font-semibold">x</TableCell>;',
      ),
    ).toEqual(['table-restyle']);
  });

  it('allows alignment and tone props', () => {
    expect(
      scan(
        table,
        'import { TableCell } from \'@ui/primitives/table\';\nexport const A = () => <TableCell align="center" tone="muted">x</TableCell>;',
      ),
    ).toEqual([]);
  });
});

describe('definition-list guard', () => {
  it('flags a dl with a fixed first column', () => {
    expect(
      scan(
        definitionList,
        'export const A = () => <dl className="grid grid-cols-[auto_1fr] gap-3"><dt>a</dt><dd>b</dd></dl>;',
      ),
    ).toEqual(['definition-list-hand-built']);
  });

  it('flags a row with a term and a fixed-width column', () => {
    expect(
      scan(
        definitionList,
        'export const A = () => <div className="grid sm:grid-cols-[9rem_1fr]"><dt>a</dt><dd>b</dd></div>;',
      ),
    ).toEqual(['definition-list-hand-built']);
  });

  it('allows a grid without terms', () => {
    expect(
      scan(
        definitionList,
        'export const A = () => <ul className="grid grid-cols-[7rem_1fr]"><li>a</li></ul>;',
      ),
    ).toEqual([]);
  });
});

describe('loading guard', () => {
  it('flags hand-built pulses and spinners', () => {
    expect(
      scan(
        loading,
        'export const A = () => <div className="h-4 animate-pulse bg-muted" />;',
      ),
    ).toEqual(['loading-pulse-hand-built']);
    expect(
      scan(
        loading,
        'export const A = () => <Icon className="size-4 animate-spin" />;',
      ),
    ).toEqual(['loading-spinner']);
  });

  it('stays out of the shared package', () => {
    expect(
      scan(
        loading,
        'export const A = () => <div className="animate-pulse" />;',
        'packages/ui/src/primitives/skeleton.tsx',
      ),
    ).toEqual([]);
  });
});
