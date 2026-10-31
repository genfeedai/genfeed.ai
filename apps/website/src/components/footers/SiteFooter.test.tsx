import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('SiteFooter theme contract', () => {
  it('uses semantic chrome instead of forcing a dark footer', () => {
    const source = readFileSync(
      join(process.cwd(), 'src/components/footers/SiteFooter.tsx'),
      'utf8',
    );

    expect(source).toContain('bg-background text-foreground');
    expect(source).toContain('border-border');
    expect(source).toContain('text-muted-foreground');
    expect(source).toContain('dark:invert');
    expect(source).not.toContain('[color-scheme:dark]');
    expect(source).not.toMatch(/\b(?:bg-black|text-white|border-white)\b/);
  });

  it('stacks every link into one column on phones', () => {
    const source = readFileSync(
      join(process.cwd(), 'src/components/footers/SiteFooter.tsx'),
      'utf8',
    );

    expect(source).toContain('grid grid-cols-1');
    expect(source).not.toMatch(/(?<![\w:])grid-cols-2\b/);
    expect(source).toContain('flex flex-col md:flex-row');
    expect(source).toContain('min-h-10');
  });
});
