import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('app/(protected)/[orgSlug]/[brandSlug]/library/layout.tsx', () => {
  it('portals Library-owned navigation into the permanent shell column', () => {
    const source = readFileSync(
      join(
        process.cwd(),
        'app/(protected)/[orgSlug]/[brandSlug]/library/layout.tsx',
      ),
      'utf8',
    );

    expect(source).toContain('FeatureGate');
    expect(source).toContain('LibrarySidebarNav');
    expect(source).toContain('createPortal');
    expect(source).toContain('workspaceNavPanel.portalTarget');
  });
});
