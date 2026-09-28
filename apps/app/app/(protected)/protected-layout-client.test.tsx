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

  it('gates module routes outside the shell error boundaries', () => {
    const source = readFileSync(
      join(process.cwd(), 'app/(protected)/protected-layout-client.tsx'),
      'utf8',
    );
    expect(source.indexOf('<PlatformModuleRouteGate>')).toBeGreaterThan(-1);
    expect(source.indexOf('<PlatformModuleRouteGate>')).toBeLessThan(
      source.indexOf('<AppProtectedLayout'),
    );
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
