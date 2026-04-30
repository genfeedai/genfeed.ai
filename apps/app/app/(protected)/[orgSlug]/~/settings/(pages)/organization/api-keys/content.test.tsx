import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('app/(protected)/[orgSlug]/~/settings/(pages)/organization/api-keys/content.tsx', () => {
  it('explains hosted defaults before BYOK overrides', () => {
    const source = readFileSync(
      join(
        process.cwd(),
        'app/(protected)/[orgSlug]/~/settings/(pages)/organization/api-keys/content.tsx',
      ),
      'utf8',
    );

    expect(source).toContain(
      'Genfeed uses the server-configured providers by default.',
    );
    expect(source).toContain('override hosted access');
    expect(source).toContain('no credits are deducted');
    expect(source).toContain('DesktopLocalProviderSettings');
    expect(source).toContain('isDesktopShell');
  });
});
