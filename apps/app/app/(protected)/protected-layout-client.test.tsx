import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('app/(protected)/protected-layout-client.tsx', () => {
  it('installs canonical core-app fallbacks at the protected shell boundary', () => {
    const source = readFileSync(
      join(process.cwd(), 'app/(protected)/protected-layout-client.tsx'),
      'utf8',
    );
    expect(source).toContain('export ');
    expect(source).toContain('getCoreAppFeatureFlagFallbacks');
    expect(source).toContain(
      'FeatureFlagProvider fallbacks={CORE_APP_FEATURE_FLAG_FALLBACKS}',
    );
  });
});
