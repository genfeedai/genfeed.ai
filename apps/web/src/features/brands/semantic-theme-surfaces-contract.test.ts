import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const BRANDS_ROOT = import.meta.dirname;

describe('brands semantic theme surfaces', () => {
  it('removes fixed dark-only chrome from the manual kit card', () => {
    const source = readFileSync(
      join(BRANDS_ROOT, 'components/sidebar/BrandDetailManualKitCard.tsx'),
      'utf8',
    );

    expect(source).toContain('border-border');
    expect(source).not.toContain('border-white');
  });
});
