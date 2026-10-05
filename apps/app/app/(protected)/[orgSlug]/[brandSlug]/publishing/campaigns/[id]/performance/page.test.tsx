import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { assertSourceHasExport } from '@shared/pages/sourceContractTestUtils';
import { describe, expect, it } from 'vitest';

assertSourceHasExport(
  'app/(protected)/[orgSlug]/[brandSlug]/publishing/campaigns/[id]/performance/page.tsx',
);

describe('synchronous route shell', () => {
  it('renders the client route without awaiting URL props', () => {
    const source = readFileSync(
      join(
        process.cwd(),
        'app/(protected)/[orgSlug]/[brandSlug]/publishing/campaigns/[id]/performance/page.tsx',
      ),
      'utf8',
    );
    expect(source).toMatch(/export default function/);
    expect(source).not.toMatch(/await (params|searchParams)/);
    expect(source).toContain('<PublishingCampaignPerformanceRoute />');
  });
});
