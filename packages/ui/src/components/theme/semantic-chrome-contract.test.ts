import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const UI_ROOT = join(process.cwd(), 'src/components');

function readComponent(relativePath: string): string {
  return readFileSync(join(UI_ROOT, relativePath), 'utf8');
}

describe('shared semantic chrome contract', () => {
  it.each([
    'analytics/trends/trending-hashtags.tsx',
    'analytics/trends/trending-sounds.tsx',
  ])('uses semantic trend-card dividers in %s', (relativePath) => {
    const source = readComponent(relativePath);

    expect(source).toContain('border-border');
    expect(source).not.toContain('border-white');
  });
});
