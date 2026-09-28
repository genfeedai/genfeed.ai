import { PLATFORM_FEATURE_SETTINGS_CACHE_TTL_MS } from '@api/feature-flag/feature-flag.constants';
import { PlatformFeatureSettingsService } from '@api/feature-flag/platform-feature-settings.service';
import {
  DEFAULT_PLATFORM_FEATURE_SETTINGS,
  SAAS_UNRESOLVED_PLATFORM_FEATURE_SETTINGS,
} from '@genfeedai/contracts/constants';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ isSaaS: vi.fn() }));

vi.mock('@genfeedai/config/deployment', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('@genfeedai/config/deployment')>();
  return { ...actual, isSaaS: mocks.isSaaS };
});

const PERCEPTION_OFF = {
  media_perception: { enabled: false, variant: null },
  require_email_verification: { enabled: true, variant: null },
};

function build(
  evaluatePlatformFlags: ReturnType<typeof vi.fn>,
  isConfigured = true,
) {
  const evaluator = {
    evaluatePlatformFlags,
    isConfigured: vi.fn(() => isConfigured),
  };
  const logger = { warn: vi.fn() };
  const service = new PlatformFeatureSettingsService(
    evaluator as never,
    logger as never,
  );
  return { evaluator, logger, service };
}

describe('PlatformFeatureSettingsService (#5468)', () => {
  beforeEach(() => {
    mocks.isSaaS.mockReturnValue(true);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('serves the code defaults without PostHog and never calls it', async () => {
    mocks.isSaaS.mockReturnValue(false);
    const evaluate = vi.fn();
    const { service } = build(evaluate, false);

    await expect(service.getFeatureSettings()).resolves.toEqual(
      DEFAULT_PLATFORM_FEATURE_SETTINGS,
    );
    expect(evaluate).not.toHaveBeenCalled();
  });

  it('maps the PostHog flags onto the typed switches', async () => {
    const { service } = build(vi.fn().mockResolvedValue(PERCEPTION_OFF));

    await expect(service.getFeatureSettings()).resolves.toMatchObject({
      isEmailVerificationRequired: true,
      isMediaPerceptionEnabled: false,
    });
  });

  it('asks PostHog once per TTL, however many callers', async () => {
    vi.useFakeTimers();
    const evaluate = vi.fn().mockResolvedValue(PERCEPTION_OFF);
    const { service } = build(evaluate);

    await Promise.all([
      service.getFeatureSettings(),
      service.getFeatureSettings(),
    ]);
    vi.advanceTimersByTime(PLATFORM_FEATURE_SETTINGS_CACHE_TTL_MS - 1);
    await service.getFeatureSettings();
    expect(evaluate).toHaveBeenCalledTimes(1);

    vi.advanceTimersByTime(1);
    await service.getFeatureSettings();
    expect(evaluate).toHaveBeenCalledTimes(2);
  });

  it('applies a flag change on the next TTL', async () => {
    vi.useFakeTimers();
    const evaluate = vi
      .fn()
      .mockResolvedValueOnce(PERCEPTION_OFF)
      .mockResolvedValueOnce({
        media_perception: { enabled: true, variant: null },
      });
    const { service } = build(evaluate);

    await expect(service.getFeatureSettings()).resolves.toMatchObject({
      isMediaPerceptionEnabled: false,
    });
    vi.advanceTimersByTime(PLATFORM_FEATURE_SETTINGS_CACHE_TTL_MS);
    await expect(service.getFeatureSettings()).resolves.toMatchObject({
      isMediaPerceptionEnabled: true,
    });
  });

  it('keeps the last known switches when PostHog stops answering', async () => {
    vi.useFakeTimers();
    const evaluate = vi
      .fn()
      .mockResolvedValueOnce(PERCEPTION_OFF)
      .mockResolvedValueOnce(undefined);
    const { logger, service } = build(evaluate);

    await service.getFeatureSettings();
    vi.advanceTimersByTime(PLATFORM_FEATURE_SETTINGS_CACHE_TTL_MS);

    await expect(service.getFeatureSettings()).resolves.toMatchObject({
      isEmailVerificationRequired: true,
      isMediaPerceptionEnabled: false,
    });
    expect(logger.warn).toHaveBeenCalled();
  });

  it('serves the conservative SaaS profile, uncached, before any answer', async () => {
    const evaluate = vi
      .fn()
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce({
        require_email_verification: { enabled: false, variant: null },
      });
    const { service } = build(evaluate);

    await expect(service.getFeatureSettings()).resolves.toEqual(
      SAAS_UNRESOLVED_PLATFORM_FEATURE_SETTINGS,
    );
    // PostHog recovered: the next call asks again instead of serving a guess.
    await expect(service.getFeatureSettings()).resolves.toMatchObject({
      isEmailVerificationRequired: false,
    });
    expect(evaluate).toHaveBeenCalledTimes(2);
  });

  it('treats a switch PostHog omits as disabled, because inactive flags are omitted', async () => {
    // media_perception deactivated in PostHog: the response omits it.
    const { service } = build(
      vi.fn().mockResolvedValue({
        require_email_verification: { enabled: true, variant: null },
      }),
    );

    await expect(service.getFeatureSettings()).resolves.toMatchObject({
      isEmailVerificationRequired: true,
      isMediaPerceptionEnabled: false,
      moderationMode: 'off',
    });
  });

  it('keeps production posture when PostHog answers without any platform flag', async () => {
    // Flags not migrated yet (or all deleted): never fall back to the
    // permissive self-host defaults on SaaS.
    const { logger, service } = build(vi.fn().mockResolvedValue({}));

    await expect(service.getFeatureSettings()).resolves.toEqual(
      SAAS_UNRESOLVED_PLATFORM_FEATURE_SETTINGS,
    );
    expect(logger.warn).toHaveBeenCalled();
  });

  it('keeps production posture on SaaS when PostHog is not configured', async () => {
    const evaluate = vi.fn();
    const { service } = build(evaluate, false);

    await expect(service.getFeatureSettingsState()).resolves.toEqual({
      isResolved: false,
      settings: SAAS_UNRESOLVED_PLATFORM_FEATURE_SETTINGS,
    });
    expect(evaluate).not.toHaveBeenCalled();
  });

  it('reports whether the switches came from a real answer', async () => {
    const evaluate = vi
      .fn()
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce(PERCEPTION_OFF);
    const { service } = build(evaluate);

    await expect(service.getFeatureSettingsState()).resolves.toMatchObject({
      isResolved: false,
    });
    await expect(service.getFeatureSettingsState()).resolves.toMatchObject({
      isResolved: true,
    });
  });
});
