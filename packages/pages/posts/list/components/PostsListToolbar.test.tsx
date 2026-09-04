import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import Module from './PostsListToolbar.tsx';

describe('PostsListToolbar.tsx', () => {
  const source = readFileSync(
    join(import.meta.dirname, 'PostsListToolbar.tsx'),
    'utf8',
  );

  it('exports a component', () => {
    expect(Module).toBeDefined();
  });

  it('resolves publisher view labels through the host pages catalog', () => {
    expect(source).toContain("useTranslations('pages.posts.list')");
    expect(source).not.toContain('Held as data rather than inline JSX');
    expect(source).not.toContain("label: 'Not posted'");
  });

  it('does not accept route navigation as toolbar content', () => {
    expect(source).not.toContain('viewNode');
    expect(source).not.toContain('ReactNode');
  });
});
