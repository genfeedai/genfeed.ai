import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mockDestroy = vi.fn();
const mockEvalFeature = vi.fn();
const mockInit = vi.fn();
const mockRefreshFeatures = vi.fn();

vi.mock('@growthbook/growthbook', () => ({
  GrowthBookClient: vi.fn(
    class MockGrowthBookClient {
      destroy = mockDestroy;
      evalFeature = mockEvalFeature;
      init = mockInit;
      refreshFeatures = mockRefreshFeatures;
    },
  ),
}));

import { FeatureFlagService } from '@api/feature-flag/feature-flag.service';
import { GrowthBookClient } from '@growthbook/growthbook';

function createConfigService() {
  return {
    get: vi.fn((key: string) => {
      if (key === 'FEATURE_FLAG_DEFAULTS') return '';
      if (key === 'GROWTHBOOK_API_HOST') return 'http://localhost:3106';
      if (key === 'GROWTHBOOK_CLIENT_KEY') return 'sdk-key';
      return '';
    }),
    isDevelopment: false,
  };
}

describe('FeatureFlagService', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    mockDestroy.mockReset();
    mockEvalFeature.mockReset();
    mockInit.mockReset();
    mockRefreshFeatures.mockReset();
  });

  afterEach(() => {
    vi.clearAllTimers();
    vi.useRealTimers();
  });

  it('returns false when GrowthBook is not configured', () => {
    const service = new FeatureFlagService(
      {
        get: vi.fn((key: string) =>
          key === 'FEATURE_FLAG_DEFAULTS' ? '' : '',
        ),
      } as never,
      {
        debug: vi.fn(),
        warn: vi.fn(),
      } as never,
    );

    expect(service.isEnabled('new-dashboard')).toBe(false);
  });

  it('uses explicit local defaults when GrowthBook is not configured', async () => {
    const service = new FeatureFlagService(
      {
        get: vi.fn((key: string) => {
          if (key === 'FEATURE_FLAG_DEFAULTS') {
            return JSON.stringify({
              enabled_feature: true,
              theme_variant: 'control',
            });
          }
          return '';
        }),
      } as never,
      {
        debug: vi.fn(),
        warn: vi.fn(),
      } as never,
    );

    await service.init();

    expect(service.isEnabled('enabled_feature')).toBe(true);
    expect(service.getFeatureValue('theme_variant', 'fallback')).toBe(
      'control',
    );
  });

  it('initializes the GrowthBook client with config values', async () => {
    mockInit.mockResolvedValue({ source: 'network', success: true });
    const configService = createConfigService();
    configService.isDevelopment = true;

    const service = new FeatureFlagService(
      configService as never,
      {
        debug: vi.fn(),
        warn: vi.fn(),
      } as never,
    );

    await service.init();

    expect(GrowthBookClient).toHaveBeenCalledWith(
      expect.objectContaining({
        apiHost: 'http://localhost:3106',
        clientKey: 'sdk-key',
        debug: true,
      }),
    );
    expect(mockInit).toHaveBeenCalledWith({ streaming: false });
  });

  it('returns evaluated boolean state when a feature is present', async () => {
    mockInit.mockResolvedValue({ source: 'network', success: true });
    mockEvalFeature.mockReturnValue({
      on: true,
      source: 'force',
      value: true,
    });

    const service = new FeatureFlagService(
      createConfigService() as never,
      {
        debug: vi.fn(),
        warn: vi.fn(),
      } as never,
    );

    await service.init();

    expect(service.isEnabled('new-dashboard', { id: 'user-123' })).toBe(true);
    expect(mockEvalFeature).toHaveBeenCalledWith('new-dashboard', {
      attributes: { id: 'user-123' },
    });
  });

  it('returns the default value when GrowthBook has no matching feature value', async () => {
    mockInit.mockResolvedValue({ source: 'network', success: true });
    mockEvalFeature.mockReturnValue({
      on: false,
      source: 'unknownFeature',
      value: null,
    });

    const service = new FeatureFlagService(
      createConfigService() as never,
      {
        debug: vi.fn(),
        warn: vi.fn(),
      } as never,
    );

    await service.init();

    expect(service.getFeatureValue('theme-variant', 'control')).toBe('control');
  });

  it('logs a warning when the initial GrowthBook refresh fails', async () => {
    mockInit.mockRejectedValue(new Error('down'));

    const loggerService = {
      debug: vi.fn(),
      warn: vi.fn(),
    };

    const service = new FeatureFlagService(
      createConfigService() as never,
      loggerService as never,
    );

    await service.init();

    expect(loggerService.warn).toHaveBeenCalledWith(
      'GrowthBook refresh failed; feature flags default to off until the next successful refresh',
      expect.objectContaining({
        reason: 'initial',
      }),
    );
  });
});
