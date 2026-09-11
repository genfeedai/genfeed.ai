import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { findInlineTypes, listInlineTypeFiles } from './check-inline-types';

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
  it('flags object contracts nested in unions, intersections and generic wrappers', () => {
    const findings = findInlineTypes(
      'hook.ts',
      [
        "type Result = { status: 'ready'; value: string } | { status: 'error'; error: Error };",
        'type LayoutProps = PropsWithChildren<{ service?: Service }>; ',
        'type Seed = Pick<State, "nodes"> & { name: string };',
        'type Response = Promise<{ items: string[] }>;',
      ].join('\n'),
    );
    expect(findings.map((finding) => finding.name)).toEqual([
      'Result',
      'LayoutProps',
      'Seed',
      'Response',
    ]);
  });

  it('scans production route hooks and pages while excluding test, fixture and declaration files', () => {
    const root = mkdtempSync(path.join(tmpdir(), 'inline-route-types-'));
    try {
      const files = [
        'apps/app/app/(protected)/home/content.tsx',
        'apps/app/app/(protected)/home/use-home.ts',
        'apps/app/app/(protected)/home/home.test.ts',
        'apps/app/app/(protected)/home/home.spec.tsx',
        'apps/app/app/(protected)/home/global.d.ts',
        'apps/app/app/(protected)/home/__fixtures__/home.ts',
        'apps/app/app/(protected)/home/__tests__/home.tsx',
        'packages/props/home/home.props.ts',
      ];
      for (const file of files) {
        const absolute = path.join(root, file);
        mkdirSync(path.dirname(absolute), { recursive: true });
        writeFileSync(absolute, 'interface Props { name: string }');
      }
      expect(listInlineTypeFiles(root)).toEqual(files.slice(0, 2));
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
