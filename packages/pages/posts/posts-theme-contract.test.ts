import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const POSTS_ROOT = join(import.meta.dirname);

function readPostSource(relativePath: string): string {
  return readFileSync(join(POSTS_ROOT, relativePath), 'utf8');
}

describe('posts semantic theme contract', () => {
  it.each([
    'list/components/PostsListToolbar.tsx',
    'library/publishing-content-library-toolbar.tsx',
    'list/components/PostsGrid.tsx',
  ])('uses semantic application chrome in %s', (relativePath) => {
    const source = readPostSource(relativePath);

    expect(source).toContain('border-border');
    expect(source).toContain('text-foreground');
    expect(source).not.toMatch(/(?:bg|border|text|hover:bg|hover:text)-white/);
  });
});
