import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('app/(protected)/protected-layout-client.tsx', () => {
  it('feeds the Admin platform flags to the shell, not PostHog (#5468)', () => {
    const source = readFileSync(
      join(process.cwd(), 'app/(protected)/protected-layout-client.tsx'),
      'utf8',
    );
    expect(source).toContain('export ');
    expect(source).toContain('usePlatformFlags(');
    expect(source).toContain('initialBootstrap?.platformFlags');
    expect(source).toContain('<FeatureFlagProvider defaults={platformFlags}>');
    expect(source).not.toContain('subscribeAnalyticsFeatureFlags');
    expect(source).toContain("endsWith('@genfeed.ai')");
  });
});
