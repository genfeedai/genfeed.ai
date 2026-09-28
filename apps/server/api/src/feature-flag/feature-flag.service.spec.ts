import { FeatureFlagService } from '@api/feature-flag/feature-flag.service';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  isSaaS: vi.fn(),
}));

vi.mock('@genfeedai/config/deployment', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('@genfeedai/config/deployment')>();

  return { ...actual, isSaaS: mocks.isSaaS };
});

function createLogger() {
  return {
    debug: vi.fn(),
    warn: vi.fn(),
  };
}

function createEvaluator(
  isEnabled: ReturnType<typeof vi.fn> = vi.fn(),
  isConfigured = true,
) {
  return { isConfigured: vi.fn(() => isConfigured), isEnabled };
}

describe('FeatureFlagService', () => {
  beforeEach(() => {
    mocks.isSaaS.mockReturnValue(false);
  });

  describe('without PostHog (Community, Desktop, self-hosted)', () => {
    it('enables reply_bot by its offline default without calling PostHog', async () => {
      const evaluator = createEvaluator();
      const service = new FeatureFlagService(
        createLogger() as never,
        evaluator as never,
      );

      await expect(
        service.isEnabled('reply_bot', { id: 'user-123' }),
      ).resolves.toBe(true);
      expect(evaluator.isEnabled).not.toHaveBeenCalled();
    });

    it('keeps an unregistered flag off', async () => {
      const service = new FeatureFlagService(createLogger() as never);

      await expect(service.isEnabled('some_new_flag')).resolves.toBe(false);
    });
  });

  describe('SaaS', () => {
    beforeEach(() => {
      mocks.isSaaS.mockReturnValue(true);
    });

    it('uses the offline default when PostHog is absent', async () => {
      const evaluator = createEvaluator(vi.fn(), false);
      const service = new FeatureFlagService(
        createLogger() as never,
        evaluator as never,
      );

      await expect(
        service.isEnabled('reply_bot', { id: 'user-123', is_internal: true }),
      ).resolves.toBe(true);
      expect(evaluator.isEnabled).not.toHaveBeenCalled();
    });

    it('follows PostHog for any flag key', async () => {
      const evaluator = createEvaluator(
        vi.fn(async (flagKey: string) => flagKey === 'moodboard'),
      );
      const service = new FeatureFlagService(
        createLogger() as never,
        evaluator as never,
      );

      await expect(
        service.isEnabled('reply_bot', { id: 'user-123', is_internal: false }),
      ).resolves.toBe(false);
      await expect(
        service.isEnabled('moodboard', { id: 'user-123' }),
      ).resolves.toBe(true);
      expect(evaluator.isEnabled).toHaveBeenCalledWith('reply_bot', {
        id: 'user-123',
        is_internal: false,
      });
    });

    it('caches decisions per flag and user', async () => {
      const isEnabled = vi.fn().mockResolvedValue(true);
      const service = new FeatureFlagService(
        createLogger() as never,
        createEvaluator(isEnabled) as never,
      );

      await service.isEnabled('reply_bot', { id: 'user-1' });
      await service.isEnabled('reply_bot', { id: 'user-1' });
      await service.isEnabled('reply_bot', { id: 'user-2' });
      await service.isEnabled('moodboard', { id: 'user-1' });

      expect(isEnabled).toHaveBeenCalledTimes(3);
    });

    it('falls back to the offline default when PostHog does not answer', async () => {
      const service = new FeatureFlagService(
        createLogger() as never,
        createEvaluator(vi.fn().mockResolvedValue(undefined)) as never,
      );

      await expect(
        service.isEnabled('reply_bot', { id: 'user-123' }),
      ).resolves.toBe(true);
      await expect(
        service.isEnabled('some_new_flag', { id: 'user-123' }),
      ).resolves.toBe(false);
    });

    it('keeps a cached false when PostHog later fails', async () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2026-08-12T12:00:00.000Z'));
      const service = new FeatureFlagService(
        createLogger() as never,
        createEvaluator(
          vi.fn().mockResolvedValueOnce(false).mockResolvedValueOnce(undefined),
        ) as never,
      );

      try {
        await expect(
          service.isEnabled('reply_bot', { id: 'user-123' }),
        ).resolves.toBe(false);

        vi.setSystemTime(new Date('2026-08-12T12:01:00.000Z'));

        await expect(
          service.isEnabled('reply_bot', { id: 'user-123' }),
        ).resolves.toBe(false);
      } finally {
        vi.useRealTimers();
      }
    });
  });
});
