import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

const POSTS_ROOT = import.meta.dirname;
const RAW_CHROME_PATTERN =
  /\b(?:text-white|bg-black|bg-white|text-black)(?:\/(?:\d+|\[[^\]]+\]))?\b/u;
const CONTENT_COLOR_ALLOW_MARKER = 'design-system-allow-content-color';

function readPost(relativePath: string): string {
  return readFileSync(join(POSTS_ROOT, relativePath), 'utf8');
}

function collectProductionSources(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return collectProductionSources(path);
    if (!/\.(?:ts|tsx)$/u.test(entry.name)) return [];
    if (/\.(?:spec|test|stories)\.(?:ts|tsx)$/u.test(entry.name)) return [];
    return [path];
  });
}

describe('posts semantic theme surfaces', () => {
  it('documents every intentional fixed black/white content color inline', () => {
    const violations = collectProductionSources(POSTS_ROOT).flatMap((file) =>
      readFileSync(file, 'utf8')
        .split('\n')
        .flatMap((line, index) => {
          if (line.includes(CONTENT_COLOR_ALLOW_MARKER)) return [];
          return RAW_CHROME_PATTERN.test(line)
            ? [`${relative(POSTS_ROOT, file)}:${index + 1}: ${line.trim()}`]
            : [];
        }),
    );

    expect(violations).toEqual([]);
  });

  it('removes fixed dark-only chrome from the post detail card body', () => {
    const source = readPost('detail/components/PostDetailCardBody.tsx');

    expect(source).toContain('border-border');
    expect(source).not.toContain('border-white');
  });

  it('uses the shared Card for semantic card surfaces in the posts grid', () => {
    const source = readPost('list/components/PostsGrid.tsx');

    expect(source).toContain("import Card from '@ui/card/Card'");
    expect(source).toContain('<Card');
  });
});
