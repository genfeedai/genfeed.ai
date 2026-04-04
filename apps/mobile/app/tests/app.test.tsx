import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const currentDir = path.dirname(fileURLToPath(import.meta.url));

function getSource(relPath: string): string {
  return readFileSync(path.resolve(currentDir, '..', relPath), 'utf8');
}

function expectDefaultComponentExport(relPath: string) {
  const source = getSource(relPath);
  expect(source).toMatch(/export\s+default\s+function\s+\w+/);
}

describe('App Routes Export Components', () => {
  it('exports default RootLayout component', () => {
    expectDefaultComponentExport('app/_layout.tsx');
  });

  it('exports default Index component', () => {
    expectDefaultComponentExport('app/index.tsx');
  });

  it('exports default Login component', () => {
    expectDefaultComponentExport('app/(public)/login.tsx');
  });

  it('exports default protected layout component', () => {
    expectDefaultComponentExport('app/(protected)/_layout.tsx');
  });

  it('exports default public layout component', () => {
    expectDefaultComponentExport('app/(public)/_layout.tsx');
  });

  it('exports default content component', () => {
    expectDefaultComponentExport('app/(protected)/content.tsx');
  });

  it('exports default ideas component', () => {
    expectDefaultComponentExport('app/(protected)/ideas.tsx');
  });

  it('exports default analytics component', () => {
    expectDefaultComponentExport('app/(protected)/analytics.tsx');
  });
});
