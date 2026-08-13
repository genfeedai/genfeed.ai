import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { assertSourceHasExport } from '@shared/pages/sourceContractTestUtils';
import { describe, expect, it } from 'vitest';

assertSourceHasExport(
  'app/(protected)/[orgSlug]/[brandSlug]/messages/replies/page.tsx',
);

describe('messages/replies/page.tsx', () => {
  it('gates Replies with the reply_bot feature flag', () => {
    const source = readFileSync(
      join(
        process.cwd(),
        'app/(protected)/[orgSlug]/[brandSlug]/messages/replies/page.tsx',
      ),
      'utf8',
    );

    expect(source).toContain('FeatureGate');
    expect(source).toContain('REPLY_BOT_FEATURE_FLAG');
  });
});
