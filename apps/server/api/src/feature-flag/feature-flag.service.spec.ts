import { FeatureFlagService } from '@api/feature-flag/feature-flag.service';
import { describe, expect, it, vi } from 'vitest';

function createConfigService(overrides: Record<string, string> = {}) {
  return {
    get: vi.fn((key: string) => overrides[key] ?? ''),
  };
}

describe('FeatureFlagService', () => {
  it('returns true when no defaults are configured', () => {
    const service = new FeatureFlagService(
      createConfigService() as never,
      { debug: vi.fn(), warn: vi.fn() } as never,
    );

    expect(service.isEnabled('new-dashboard')).toBe(true);
  });

  it('uses explicit local defaults', async () => {
    const service = new FeatureFlagService(
      createConfigService({
        FEATURE_FLAG_DEFAULTS: JSON.stringify({
          enabled_feature: true,
          theme_variant: 'control',
        }),
      }) as never,
      { debug: vi.fn(), warn: vi.fn() } as never,
    );

    await service.init();

    expect(service.isEnabled('enabled_feature')).toBe(true);
    expect(service.getFeatureValue('theme_variant', 'fallback')).toBe(
      'control',
    );
  });

  it('returns the default value when a flag key is missing', async () => {
    const service = new FeatureFlagService(
      createConfigService({
        FEATURE_FLAG_DEFAULTS: JSON.stringify({ other: true }),
      }) as never,
      { debug: vi.fn(), warn: vi.fn() } as never,
    );

    await service.init();

    expect(service.getFeatureValue('theme-variant', 'control')).toBe('control');
  });

  it('returns false for missing flags when defaults are configured', async () => {
    const service = new FeatureFlagService(
      createConfigService({
        FEATURE_FLAG_DEFAULTS: JSON.stringify({ other: true }),
      }) as never,
      { debug: vi.fn(), warn: vi.fn() } as never,
    );

    await service.init();

    expect(service.isEnabled('new-dashboard')).toBe(false);
  });

  it('fails closed when FEATURE_FLAG_DEFAULTS is invalid JSON', async () => {
    const loggerService = {
      debug: vi.fn(),
      warn: vi.fn(),
    };

    const service = new FeatureFlagService(
      createConfigService({
        FEATURE_FLAG_DEFAULTS: 'not-json',
      }) as never,
      loggerService as never,
    );

    await service.init();

    expect(loggerService.warn).toHaveBeenCalledWith(
      'Failed to parse FEATURE_FLAG_DEFAULTS; feature flags will fail closed',
      expect.objectContaining({
        error: expect.any(Error),
      }),
    );
    expect(service.isEnabled('new-dashboard')).toBe(false);
  });

  it('accepts optional attributes parameter without error', async () => {
    const service = new FeatureFlagService(
      createConfigService({
        FEATURE_FLAG_DEFAULTS: JSON.stringify({ dashboard: true }),
      }) as never,
      { debug: vi.fn(), warn: vi.fn() } as never,
    );

    await service.init();

    expect(service.isEnabled('dashboard', { id: 'user-123' })).toBe(true);
  });
});
