import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { assertSourceHasExport } from '@shared/pages/sourceContractTestUtils';
import { describe, expect, it } from 'vitest';

assertSourceHasExport(
  'app/(protected)/[orgSlug]/[brandSlug]/playground/[jobId]/page.tsx',
);

describe('synchronous route shell', () => {
  it('keeps the client workspace in the shared layout without awaiting URL props', () => {
    const source = readFileSync(
      join(
        process.cwd(),
        'app/(protected)/[orgSlug]/[brandSlug]/playground/[jobId]/page.tsx',
      ),
      'utf8',
    );
    expect(source).toMatch(/export default function/);
    expect(source).not.toMatch(/await (params|searchParams)/);
    expect(source).toContain('return null;');
    const layout = readFileSync(
      join(
        process.cwd(),
        'app/(protected)/[orgSlug]/[brandSlug]/playground/layout.tsx',
      ),
      'utf8',
    );
    expect(layout).toContain('<StudioPlaygroundRoute />');
  });
});
