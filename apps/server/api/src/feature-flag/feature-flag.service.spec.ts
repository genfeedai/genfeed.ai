import { FeatureFlagService } from '@api/feature-flag/feature-flag.service';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  isSaaS: vi.fn(),
}));

vi.mock('@genfeedai/config/deployment', () => ({
  isSaaS: mocks.isSaaS,
}));

function createConfigService(overrides: Record<string, string> = {}) {
  return {
    get: vi.fn((key: string) => overrides[key] ?? ''),
  };
}

function createLogger() {
  return {
    debug: vi.fn(),
    warn: vi.fn(),
  };
}

describe('FeatureFlagService', () => {
  beforeEach(() => {
    mocks.isSaaS.mockReturnValue(false);
  });

  it('returns true when no defaults are configured', async () => {
    const service = new FeatureFlagService(
      createConfigService() as never,
      createLogger() as never,
    );

    await expect(service.isEnabled('new-dashboard')).resolves.toBe(true);
  });

  it('uses explicit local defaults', async () => {
    const service = new FeatureFlagService(
      createConfigService({
        FEATURE_FLAG_DEFAULTS: JSON.stringify({
          enabled_feature: true,
          theme_variant: 'control',
        }),
      }) as never,
      createLogger() as never,
    );

    await service.init();

    await expect(service.isEnabled('enabled_feature')).resolves.toBe(true);
    expect(service.getFeatureValue('theme_variant', 'fallback')).toBe(
      'control',
    );
  });

  it('returns the default value when a flag key is missing', async () => {
    const service = new FeatureFlagService(
      createConfigService({
        FEATURE_FLAG_DEFAULTS: JSON.stringify({ other: true }),
      }) as never,
      createLogger() as never,
    );

    await service.init();

    expect(service.getFeatureValue('theme-variant', 'control')).toBe('control');
  });

  it('returns false for missing flags when defaults are configured', async () => {
    const service = new FeatureFlagService(
      createConfigService({
        FEATURE_FLAG_DEFAULTS: JSON.stringify({ other: true }),
      }) as never,
      createLogger() as never,
    );

    await service.init();

    await expect(service.isEnabled('new-dashboard')).resolves.toBe(false);
  });

  it('fails closed when FEATURE_FLAG_DEFAULTS is invalid JSON', async () => {
    const loggerService = createLogger();

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
    await expect(service.isEnabled('new-dashboard')).resolves.toBe(false);
  });

  it('accepts optional attributes parameter without error', async () => {
    const service = new FeatureFlagService(
      createConfigService({
        FEATURE_FLAG_DEFAULTS: JSON.stringify({ dashboard: true }),
      }) as never,
      createLogger() as never,
    );

    await service.init();

    await expect(
      service.isEnabled('dashboard', { id: 'user-123' }),
    ).resolves.toBe(true);
  });

  it('enables reply_bot in Community without calling PostHog', async () => {
    const evaluator = {
      isConfigured: vi.fn(() => true),
      isEnabled: vi.fn(),
    };
    const service = new FeatureFlagService(
      createConfigService({
        FEATURE_FLAG_DEFAULTS: JSON.stringify({ other: true }),
      }) as never,
      createLogger() as never,
      evaluator as never,
    );

    await service.init();

    await expect(
      service.isEnabled('reply_bot', { id: 'user-123' }),
    ).resolves.toBe(true);
    expect(evaluator.isConfigured).not.toHaveBeenCalled();
    expect(evaluator.isEnabled).not.toHaveBeenCalled();
  });

  it('does not require FEATURE_FLAG_DEFAULTS to enable reply_bot', async () => {
    const service = new FeatureFlagService(
      createConfigService() as never,
      createLogger() as never,
    );

    await expect(service.isEnabled('reply_bot')).resolves.toBe(true);
  });

  it('ignores env JSON when enabling reply_bot', async () => {
    const service = new FeatureFlagService(
      createConfigService({
        FEATURE_FLAG_DEFAULTS: JSON.stringify({ other: true }),
      }) as never,
      createLogger() as never,
    );

    await service.init();

    await expect(service.isEnabled('reply_bot')).resolves.toBe(true);
  });

  it('does not hide reply_bot when FEATURE_FLAG_DEFAULTS is malformed', async () => {
    const service = new FeatureFlagService(
      createConfigService({
        FEATURE_FLAG_DEFAULTS: 'not-json',
      }) as never,
      createLogger() as never,
    );

    await service.init();

    await expect(service.isEnabled('reply_bot')).resolves.toBe(true);
  });

  it('fails open for reply_bot in SaaS when PostHog is absent', async () => {
    mocks.isSaaS.mockReturnValue(true);
    const evaluator = {
      isConfigured: vi.fn(() => false),
      isEnabled: vi.fn(),
    };
    const service = new FeatureFlagService(
      createConfigService() as never,
      createLogger() as never,
      evaluator as never,
    );

    await expect(
      service.isEnabled('reply_bot', { id: 'user-123', is_internal: true }),
    ).resolves.toBe(true);
    expect(evaluator.isEnabled).not.toHaveBeenCalled();
  });

  it('rejects reply_bot when PostHog disables it for the SaaS user', async () => {
    mocks.isSaaS.mockReturnValue(true);
    const evaluator = {
      isConfigured: vi.fn(() => true),
      isEnabled: vi.fn().mockResolvedValue(false),
    };
    const service = new FeatureFlagService(
      createConfigService() as never,
      createLogger() as never,
      evaluator as never,
    );

    await expect(
      service.isEnabled('reply_bot', { id: 'user-123', is_internal: false }),
    ).resolves.toBe(false);
    expect(evaluator.isEnabled).toHaveBeenCalledWith('reply_bot', {
      id: 'user-123',
      is_internal: false,
    });
  });

  it('keeps a cached reply_bot false when PostHog later fails', async () => {
    mocks.isSaaS.mockReturnValue(true);
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-12T12:00:00.000Z'));
    const evaluator = {
      isConfigured: vi.fn(() => true),
      isEnabled: vi
        .fn()
        .mockResolvedValueOnce(false)
        .mockResolvedValueOnce(undefined),
    };
    const service = new FeatureFlagService(
      createConfigService() as never,
      createLogger() as never,
      evaluator as never,
    );

    await expect(
      service.isEnabled('reply_bot', { id: 'user-123' }),
    ).resolves.toBe(false);

    vi.setSystemTime(new Date('2026-08-12T12:01:00.000Z'));

    try {
      await expect(
        service.isEnabled('reply_bot', { id: 'user-123' }),
      ).resolves.toBe(false);
    } finally {
      vi.useRealTimers();
    }
  });
});
