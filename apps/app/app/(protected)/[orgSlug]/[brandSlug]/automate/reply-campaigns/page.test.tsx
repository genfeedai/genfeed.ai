import { assertSourceHasExport } from '@shared/pages/sourceContractTestUtils';
import { describe, expect, it } from 'vitest';

assertSourceHasExport(
  'app/(protected)/[orgSlug]/[brandSlug]/orchestration/reply-campaigns/page.tsx',
);

describe('ReplyCampaignsRoute source contract', () => {
  it('registers the route module', () => {
    expect(true).toBe(true);
  });
});
