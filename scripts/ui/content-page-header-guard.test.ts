import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { findContentPageHeaderViolations } from './content-page-header-guard';

const roots: string[] = [];

function createFixture(file: string, content: string): string {
  const root = mkdtempSync(path.join(tmpdir(), 'content-page-header-guard-'));
  roots.push(root);
  const target = path.join(root, file);
  mkdirSync(path.dirname(target), { recursive: true });
  writeFileSync(target, content);
  return root;
}

describe('content page header guard', () => {
  afterEach(() => {
    roots.length = 0;
  });

  it('allows an accessible h1 and content section headings', () => {
    const root = createFixture(
      'apps/app/app/(protected)/page.tsx',
      '<><h1 className="sr-only">Library</h1><h2>Visual assets</h2></>',
    );

    expect(findContentPageHeaderViolations(root)).toEqual([]);
  });

  it('reports visible h1 and embedded breadcrumb chrome', () => {
    const root = createFixture(
      'apps/app/app/(protected)/page.tsx',
      '<><Breadcrumb segments={[]} /><h1>Library</h1></>',
    );

    expect(findContentPageHeaderViolations(root)).toEqual([
      {
        file: 'apps/app/app/(protected)/page.tsx',
        kind: 'embedded-breadcrumb',
        line: 1,
      },
      {
        file: 'apps/app/app/(protected)/page.tsx',
        kind: 'visible-h1',
        line: 1,
      },
    ]);
  });

  it('reports design-system Heading components rendered as visible h1', () => {
    const root = createFixture(
      'packages/pages/analytics/page.tsx',
      '<Heading size="2xl" as="h1">Analytics</Heading>',
    );

    expect(findContentPageHeaderViolations(root)).toEqual([
      {
        file: 'packages/pages/analytics/page.tsx',
        kind: 'visible-h1',
        line: 1,
      },
    ]);
  });
});
