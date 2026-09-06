import { describe, expect, it } from 'vitest';
import { findInlineTypes } from './check-inline-types';

describe('findInlineTypes', () => {
  it('flags top-level interfaces and object-literal type aliases', () => {
    const findings = findInlineTypes(
      'x.tsx',
      [
        "import type { ReactNode } from 'react';",
        'interface RowProps { title: string }',
        'type State = { isOpen: boolean };',
        'export default function Row() { return null; }',
      ].join('\n'),
    );
    expect(
      findings.map((finding) => `${finding.name}@${finding.line}`),
    ).toEqual(['RowProps@2', 'State@3']);
  });

  it('allows literal unions, typeof-derived aliases, and imported types', () => {
    const findings = findInlineTypes(
      'x.tsx',
      [
        "import type { RowProps } from '@props/admin/row.props';",
        "type ViewMode = 'list' | 'board';",
        "const ORDER = ['a', 'b'] as const;",
        'type Order = (typeof ORDER)[number];',
        'export default function Row(props: RowProps) { return null; }',
      ].join('\n'),
    );
    expect(findings).toEqual([]);
  });
});
