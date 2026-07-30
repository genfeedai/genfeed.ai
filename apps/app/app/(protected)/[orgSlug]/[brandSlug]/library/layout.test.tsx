import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('app/(protected)/[orgSlug]/[brandSlug]/library/layout.tsx', () => {
  it('gates library pages and leaves shell nav ownership to the protected layout', () => {
    const source = readFileSync(
      join(
        process.cwd(),
        'app/(protected)/[orgSlug]/[brandSlug]/library/layout.tsx',
      ),
      'utf8',
    );

    expect(source).toContain('FeatureGate');
    expect(source).toContain('flagKey="library"');
    expect(source).not.toContain('createPortal');
    expect(source).not.toContain('LibrarySidebarNav');
  });
});
