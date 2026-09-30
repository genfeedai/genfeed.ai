import { assertSourceHasExport } from '@shared/pages/sourceContractTestUtils';
import { describe, expect, it } from 'vitest';

assertSourceHasExport(
  'app/(protected)/[orgSlug]/[brandSlug]/messages/reply-drip/page.tsx',
);

describe('ReplyDripRoute source contract', () => {
  it('registers the route module', () => {
    expect(true).toBe(true);
  });
});
