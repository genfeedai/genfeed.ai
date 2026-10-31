import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('app/(protected)/[orgSlug]/[brandSlug]/library/layout.tsx', () => {
  it('leaves module gating and shell nav ownership to the protected layout (#5468)', () => {
    const source = readFileSync(
      join(
        process.cwd(),
        'app/(protected)/[orgSlug]/[brandSlug]/library/layout.tsx',
      ),
      'utf8',
    );

    expect(source).not.toContain('FeatureGate');
    expect(source).not.toContain('createPortal');
    expect(source).not.toContain('LibrarySidebarNav');
  });
});
