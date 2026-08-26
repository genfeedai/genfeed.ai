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
    expect(source).toContain('fallbacks={CORE_APP_FEATURE_FLAG_FALLBACKS}');
    expect(source).toContain('overrides={remoteFeatureFlags}');
  });

  it('identifies authenticated users before subscribing to PostHog flags', () => {
    const source = readFileSync(
      join(process.cwd(), 'app/(protected)/protected-layout-client.tsx'),
      'utf8',
    );
    expect(source.indexOf('identifyAnalyticsUser({')).toBeGreaterThan(-1);
    expect(source.indexOf('subscribeAnalyticsFeatureFlags(')).toBeGreaterThan(
      source.indexOf('identifyAnalyticsUser({'),
    );
    expect(source).toContain("endsWith('@genfeed.ai')");
    expect(source).toContain('REPLY_BOT_FEATURE_FLAG');
    expect(source).toContain('DESKTOP_LOCAL_WORKSPACE_FEATURE_FLAG');
    expect(source).toContain('REMOTE_FEATURE_FLAG_KEYS');
  });

  it('gates the protected provider tree on confirmed routed organization context', () => {
    const source = readFileSync(
      join(process.cwd(), 'app/(protected)/protected-layout-client.tsx'),
      'utf8',
    );

    expect(source).toContain('<RoutedOrganizationProvider>');
    expect(source).toContain('<RoutedOrganizationBoundary>');
    expect(source.indexOf('<RoutedOrganizationBoundary>')).toBeLessThan(
      source.indexOf('<AppProtectedLayout'),
    );
  });
});
