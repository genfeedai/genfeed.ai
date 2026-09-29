import { PLATFORM_FEATURE_SETTINGS_CACHE_TTL_MS } from '@api/collections/platform-settings/platform-settings.constants';
import { PlatformSettingsService } from '@api/collections/platform-settings/services/platform-settings.service';
import {
  DEFAULT_PLATFORM_FEATURE_SETTINGS,
  DEFAULT_PLATFORM_FLAGS,
  PLATFORM_SETTING_KEY,
  UNRESOLVED_PLATFORM_FEATURE_SETTINGS,
} from '@genfeedai/contracts/constants';
import {
  DEFAULT_AGENT_CHAT_MARGIN_MULTIPLIER,
  DEFAULT_GENERATION_MARGIN_MULTIPLIER,
  getRuntimeAgentChatMarginMultiplier,
  getRuntimeMarginMultiplier,
  setRuntimeAgentChatMarginMultiplier,
  setRuntimeMarginMultiplier,
} from '@genfeedai/pricing';
import { Prisma } from '@genfeedai/prisma';
import type { ConfigService } from '@libs/config/config.service';
import type { LoggerService } from '@libs/logger/logger.service';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

describe('PlatformSettingsService', () => {
  const prisma = { $executeRaw: vi.fn(), platformSetting: {} };
  const logger: Partial<LoggerService> = {
    debug: vi.fn(),
    error: vi.fn(),
    log: vi.fn(),
    warn: vi.fn(),
  };

  let service: PlatformSettingsService;

  function buildService(env: Record<string, string> = {}) {
    return new PlatformSettingsService(
      prisma as never,
      logger as LoggerService,
      {
        get: vi.fn((key: string) => env[key] ?? ''),
      } as unknown as ConfigService,
    );
  }

  beforeEach(() => {
    vi.clearAllMocks();
    setRuntimeMarginMultiplier(DEFAULT_GENERATION_MARGIN_MULTIPLIER);
    setRuntimeAgentChatMarginMultiplier(DEFAULT_AGENT_CHAT_MARGIN_MULTIPLIER);
    service = buildService({
      OPENAI_API_KEY: 'openai-key',
      TYPESAFE_API_KEY: 'typesafe-key',
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    setRuntimeMarginMultiplier(DEFAULT_GENERATION_MARGIN_MULTIPLIER);
    setRuntimeAgentChatMarginMultiplier(DEFAULT_AGENT_CHAT_MARGIN_MULTIPLIER);
  });

  describe('getSingleton', () => {
    it('returns the existing singleton row without creating', async () => {
      const row = {
        id: 'ps-1',
        key: PLATFORM_SETTING_KEY,
        marginMultiplierAgentChat: 1.7,
        marginMultiplierGeneration: 3.4,
      };
      const findOne = vi
        .spyOn(service, 'findOne')
        .mockResolvedValue(row as never);
      const create = vi.spyOn(service, 'create');

      await expect(service.getSingleton()).resolves.toBe(row);
      expect(findOne).toHaveBeenCalledWith({
        isDeleted: false,
        key: PLATFORM_SETTING_KEY,
      });
      expect(create).not.toHaveBeenCalled();
    });

    it('creates the singleton with defaults on first access', async () => {
      const created = {
        id: 'ps-1',
        key: PLATFORM_SETTING_KEY,
        marginMultiplierAgentChat: DEFAULT_AGENT_CHAT_MARGIN_MULTIPLIER,
        marginMultiplierGeneration: DEFAULT_GENERATION_MARGIN_MULTIPLIER,
      };
      vi.spyOn(service, 'findOne').mockResolvedValue(null as never);
      const create = vi
        .spyOn(service, 'create')
        .mockResolvedValue(created as never);

      await expect(service.getSingleton()).resolves.toBe(created);
      expect(create).toHaveBeenCalledWith({ key: PLATFORM_SETTING_KEY });
    });

    it('re-fetches the winner row when a concurrent create loses the race', async () => {
      const winner = {
        id: 'ps-1',
        key: PLATFORM_SETTING_KEY,
        marginMultiplierAgentChat: DEFAULT_AGENT_CHAT_MARGIN_MULTIPLIER,
        marginMultiplierGeneration: DEFAULT_GENERATION_MARGIN_MULTIPLIER,
      };
      const findOne = vi
        .spyOn(service, 'findOne')
        .mockResolvedValueOnce(null as never)
        .mockResolvedValueOnce(winner as never);
      vi.spyOn(service, 'create').mockRejectedValue(
        new Prisma.PrismaClientKnownRequestError('unique constraint failed', {
          clientVersion: 'test',
          code: 'P2002',
        }),
      );

      await expect(service.getSingleton()).resolves.toBe(winner);
      expect(findOne).toHaveBeenCalledTimes(2);
    });

    it('throws when a non-unique create failure occurs', async () => {
      vi.spyOn(service, 'findOne').mockResolvedValue(null as never);
      vi.spyOn(service, 'create').mockRejectedValue(new Error('boom'));

      await expect(service.getSingleton()).rejects.toThrow('boom');
    });

    it('throws when the row is still missing after a unique-key race', async () => {
      vi.spyOn(service, 'findOne').mockResolvedValue(null as never);
      vi.spyOn(service, 'create').mockRejectedValue(
        new Prisma.PrismaClientKnownRequestError('unique constraint failed', {
          clientVersion: 'test',
          code: 'P2002',
        }),
      );

      await expect(service.getSingleton()).rejects.toThrow(
        'Failed to initialize platform settings',
      );
    });
  });

  describe('updateSingleton', () => {
    it('patches the generation multiplier and hydrates its own runtime only', async () => {
      const current = {
        id: 'ps-1',
        key: PLATFORM_SETTING_KEY,
        marginMultiplierAgentChat: 1.7,
        marginMultiplierGeneration: 3.33,
      };
      const updated = { ...current, marginMultiplierGeneration: 4 };
      vi.spyOn(service, 'getSingleton').mockResolvedValue(current as never);
      const patch = vi
        .spyOn(service, 'patch')
        .mockResolvedValue(updated as never);

      const result = await service.updateSingleton({
        marginMultiplierGeneration: 4,
      });

      expect(patch).toHaveBeenCalledWith('ps-1', {
        marginMultiplierGeneration: 4,
      });
      expect(result).toBe(updated);
      expect(getRuntimeMarginMultiplier()).toBe(4);
      expect(getRuntimeAgentChatMarginMultiplier()).toBe(1.7);
    });

    it('patches the agent-chat multiplier and hydrates its own runtime only', async () => {
      const current = {
        id: 'ps-1',
        key: PLATFORM_SETTING_KEY,
        marginMultiplierAgentChat: 1.7,
        marginMultiplierGeneration: 3.33,
      };
      const updated = { ...current, marginMultiplierAgentChat: 2.1 };
      vi.spyOn(service, 'getSingleton').mockResolvedValue(current as never);
      const patch = vi
        .spyOn(service, 'patch')
        .mockResolvedValue(updated as never);

      const result = await service.updateSingleton({
        marginMultiplierAgentChat: 2.1,
      });

      expect(patch).toHaveBeenCalledWith('ps-1', {
        marginMultiplierAgentChat: 2.1,
      });
      expect(result).toBe(updated);
      expect(getRuntimeAgentChatMarginMultiplier()).toBe(2.1);
      expect(getRuntimeMarginMultiplier()).toBe(3.33);
    });

    it('patches the margin input mode', async () => {
      const current = {
        id: 'ps-1',
        key: PLATFORM_SETTING_KEY,
        marginInputMode: 'MARGIN',
        marginMultiplierAgentChat: 1.7,
        marginMultiplierGeneration: 3.33,
      };
      vi.spyOn(service, 'getSingleton').mockResolvedValue(current as never);
      const patch = vi.spyOn(service, 'patch').mockResolvedValue({
        ...current,
        marginInputMode: 'MARKUP',
      } as never);

      await service.updateSingleton({ marginInputMode: 'MARKUP' });

      expect(patch).toHaveBeenCalledWith('ps-1', {
        marginInputMode: 'MARKUP',
      });
    });

    it('never patches the singleton key even if one is smuggled in', async () => {
      const current = {
        id: 'ps-1',
        key: PLATFORM_SETTING_KEY,
        marginMultiplierAgentChat: 1.7,
        marginMultiplierGeneration: 1,
      };
      vi.spyOn(service, 'getSingleton').mockResolvedValue(current as never);
      const patch = vi.spyOn(service, 'patch').mockResolvedValue({
        ...current,
        marginMultiplierGeneration: 2,
      } as never);

      await service.updateSingleton({
        key: 'rogue',
        marginMultiplierGeneration: 2,
      } as never);

      expect(patch).toHaveBeenCalledWith('ps-1', {
        marginMultiplierGeneration: 2,
      });
    });

    it('patches the typed-decision provider an operator selected', async () => {
      const current = {
        id: 'ps-1',
        key: PLATFORM_SETTING_KEY,
        marginMultiplierAgentChat: 1.7,
        marginMultiplierGeneration: 1,
        typedDecisionProvider: 'none',
      };
      vi.spyOn(service, 'getSingleton').mockResolvedValue(current as never);
      const patch = vi.spyOn(service, 'patch').mockResolvedValue({
        ...current,
        typedDecisionProvider: 'jev',
      } as never);

      await service.updateSingleton({ typedDecisionProvider: 'jev' });

      expect(patch).toHaveBeenCalledWith('ps-1', {
        typedDecisionProvider: 'jev',
      });
    });

    it('rejects a provider this deployment has no credential for', async () => {
      const keyless = buildService();
      const getSingleton = vi.spyOn(keyless, 'getSingleton');
      const patch = vi.spyOn(keyless, 'patch');

      await expect(
        keyless.updateSingleton({ typedDecisionProvider: 'jev' }),
      ).rejects.toThrow('TYPESAFE_API_KEY');

      expect(getSingleton).not.toHaveBeenCalled();
      expect(patch).not.toHaveBeenCalled();
    });

    it('always accepts turning typed decisions off', async () => {
      const keyless = buildService();
      const current = {
        id: 'ps-1',
        key: PLATFORM_SETTING_KEY,
        marginMultiplierAgentChat: 1.7,
        marginMultiplierGeneration: 1,
        typedDecisionProvider: 'jev',
      };
      vi.spyOn(keyless, 'getSingleton').mockResolvedValue(current as never);
      const patch = vi.spyOn(keyless, 'patch').mockResolvedValue({
        ...current,
        typedDecisionProvider: 'none',
      } as never);

      await keyless.updateSingleton({ typedDecisionProvider: 'none' });

      expect(patch).toHaveBeenCalledWith('ps-1', {
        typedDecisionProvider: 'none',
      });
    });

    it('short-circuits when no editable fields are provided', async () => {
      const current = {
        id: 'ps-1',
        key: PLATFORM_SETTING_KEY,
        marginMultiplierAgentChat: 1.9,
        marginMultiplierGeneration: 1.5,
      };
      vi.spyOn(service, 'getSingleton').mockResolvedValue(current as never);
      const patch = vi.spyOn(service, 'patch');

      const result = await service.updateSingleton({});

      expect(result).toBe(current);
      expect(patch).not.toHaveBeenCalled();
      expect(getRuntimeMarginMultiplier()).toBe(1.5);
      expect(getRuntimeAgentChatMarginMultiplier()).toBe(1.9);
    });
  });

  describe('feature switches (#5407)', () => {
    const row = {
      id: 'ps-1',
      isMediaPerceptionEnabled: false,
      key: PLATFORM_SETTING_KEY,
      marginMultiplierAgentChat: 1.7,
      marginMultiplierGeneration: 3.33,
      moderationThresholds: { sexual: 0.4 },
      systemEventsEnabledAt: new Date('2026-09-20T10:00:00.000Z'),
    };

    it('parses the singleton into typed switches over the defaults', async () => {
      vi.spyOn(service, 'getSingleton').mockResolvedValue(row as never);

      await expect(service.getFeatureSettings()).resolves.toEqual({
        ...DEFAULT_PLATFORM_FEATURE_SETTINGS,
        isMediaPerceptionEnabled: false,
        moderationThresholds: { sexual: 0.4 },
        systemEventsEnabledAt: '2026-09-20T10:00:00.000Z',
      });
    });

    it('serves reads from the cache until the TTL passes', async () => {
      vi.useFakeTimers();
      const getSingleton = vi
        .spyOn(service, 'getSingleton')
        .mockResolvedValue(row as never);

      await service.getFeatureSettings();
      await service.getFeatureSettings();
      expect(getSingleton).toHaveBeenCalledTimes(1);

      vi.advanceTimersByTime(PLATFORM_FEATURE_SETTINGS_CACHE_TTL_MS - 1);
      await service.getFeatureSettings();
      expect(getSingleton).toHaveBeenCalledTimes(1);

      vi.advanceTimersByTime(1);
      await service.getFeatureSettings();
      expect(getSingleton).toHaveBeenCalledTimes(2);
    });

    it('shares one read between concurrent callers', async () => {
      const getSingleton = vi
        .spyOn(service, 'getSingleton')
        .mockResolvedValue(row as never);

      await Promise.all([
        service.getFeatureSettings(),
        service.getFeatureSettings(),
        service.getFeatureSettings(),
      ]);

      expect(getSingleton).toHaveBeenCalledTimes(1);
    });

    it('replaces the cache on write so this process applies it at once', async () => {
      vi.spyOn(service, 'getSingleton').mockResolvedValue(row as never);
      await service.getFeatureSettings();
      vi.spyOn(service, 'patch').mockResolvedValue({
        ...row,
        isMediaPerceptionEnabled: true,
      } as never);

      await service.updateSingleton({ isMediaPerceptionEnabled: true });

      await expect(service.getFeatureSettings()).resolves.toMatchObject({
        isMediaPerceptionEnabled: true,
      });
    });

    it('never caches a read that raced a write', async () => {
      let resolveRead: (value: unknown) => void = () => undefined;
      const getSingleton = vi.spyOn(service, 'getSingleton');
      getSingleton.mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            resolveRead = resolve;
          }) as never,
      );
      const staleRead = service.getFeatureSettings();

      getSingleton.mockResolvedValue(row as never);
      vi.spyOn(service, 'patch').mockResolvedValue({
        ...row,
        isMediaPerceptionEnabled: true,
      } as never);
      await service.updateSingleton({ isMediaPerceptionEnabled: true });
      resolveRead(row);
      await staleRead;

      await expect(service.getFeatureSettings()).resolves.toMatchObject({
        isMediaPerceptionEnabled: true,
      });
    });

    it('keeps the last known switches when a read fails', async () => {
      vi.useFakeTimers();
      vi.spyOn(service, 'getSingleton')
        .mockResolvedValueOnce(row as never)
        .mockRejectedValueOnce(new Error('db down'));

      await service.getFeatureSettings();
      vi.advanceTimersByTime(PLATFORM_FEATURE_SETTINGS_CACHE_TTL_MS);

      await expect(service.getFeatureSettings()).resolves.toMatchObject({
        isMediaPerceptionEnabled: false,
      });
      expect(logger.warn).toHaveBeenCalled();
    });

    it('serves the unresolved profile uncached when nothing was ever read', async () => {
      const getSingleton = vi
        .spyOn(service, 'getSingleton')
        .mockRejectedValueOnce(new Error('db down'))
        .mockResolvedValue({
          ...row,
          isEmailVerificationRequired: false,
        } as never);

      await expect(service.getFeatureSettingsState()).resolves.toEqual({
        isResolved: false,
        settings: UNRESOLVED_PLATFORM_FEATURE_SETTINGS,
      });
      // The database recovered: the next call reads it instead of serving a
      // cached guess for the rest of the TTL.
      await expect(service.getFeatureSettingsState()).resolves.toMatchObject({
        isResolved: true,
        settings: { isEmailVerificationRequired: false },
      });
      expect(getSingleton).toHaveBeenCalledTimes(2);
    });

    it('stays resolved on the last known switches when a later read fails', async () => {
      vi.useFakeTimers();
      vi.spyOn(service, 'getSingleton')
        .mockResolvedValueOnce(row as never)
        .mockRejectedValueOnce(new Error('db down'));

      await service.getFeatureSettingsState();
      vi.advanceTimersByTime(PLATFORM_FEATURE_SETTINGS_CACHE_TTL_MS);

      await expect(service.getFeatureSettingsState()).resolves.toMatchObject({
        isResolved: true,
        settings: { isMediaPerceptionEnabled: false },
      });
    });

    it('warms the switches cache on boot', async () => {
      const getSingleton = vi
        .spyOn(service, 'getSingleton')
        .mockResolvedValue(row as never);

      await service.onModuleInit();
      await expect(service.getFeatureSettings()).resolves.toMatchObject({
        isMediaPerceptionEnabled: false,
      });
      expect(getSingleton).toHaveBeenCalledTimes(1);
    });

    it('patches switches, stores the recording start as a date and clears an empty model', async () => {
      vi.spyOn(service, 'getSingleton').mockResolvedValue(row as never);
      const patch = vi.spyOn(service, 'patch').mockResolvedValue(row as never);

      await service.updateSingleton({
        isEmailVerificationRequired: true,
        mediaPerceptionVisionModel: '  ',
        moderationMode: 'live',
        moderationThresholds: { violence: 0.6 },
        systemEventsEnabledAt: '2026-09-28T08:00:00.000Z',
        taskRoutingMinConfidence: 0.7,
      });

      expect(patch).toHaveBeenCalledWith('ps-1', {
        isEmailVerificationRequired: true,
        mediaPerceptionVisionModel: null,
        moderationMode: 'live',
        moderationThresholds: { violence: 0.6 },
        systemEventsEnabledAt: new Date('2026-09-28T08:00:00.000Z'),
        taskRoutingMinConfidence: 0.7,
      });
    });

    it('merges a flag patch atomically in the database (#5468)', async () => {
      const saved = { ...row, flags: { analytics: false, studio: false } };
      vi.spyOn(service, 'getSingleton')
        .mockResolvedValueOnce(row as never)
        .mockResolvedValueOnce(saved as never);
      const patch = vi.spyOn(service, 'patch');

      await expect(
        service.updateSingleton({ flags: { studio: false } }),
      ).resolves.toBe(saved);

      // One jsonb `||` statement, never a read-modify-write of the whole map:
      // a concurrent save of another flag is not overwritten.
      expect(prisma.$executeRaw).toHaveBeenCalledTimes(1);
      const [sql, ...values] = prisma.$executeRaw.mock.calls[0] ?? [];
      expect((sql as TemplateStringsArray).join('?')).toContain(
        '"flags" = COALESCE("flags", \'{}\'::jsonb) || ?::jsonb',
      );
      expect(values).toEqual(['{"studio":false}', 'ps-1']);
      expect(patch).not.toHaveBeenCalled();
      await expect(service.getFeatureSettings()).resolves.toMatchObject({
        flags: { ...DEFAULT_PLATFORM_FLAGS, analytics: false, studio: false },
      });
    });

    it('saves other settings alongside a flag patch', async () => {
      vi.spyOn(service, 'getSingleton').mockResolvedValue(row as never);
      const patch = vi.spyOn(service, 'patch').mockResolvedValue(row as never);

      await service.updateSingleton({
        flags: { agent: false },
        moderationMode: 'live',
      });

      expect(prisma.$executeRaw).toHaveBeenCalledTimes(1);
      expect(patch).toHaveBeenCalledWith('ps-1', { moderationMode: 'live' });
    });

    it('turns system-event recording off with null', async () => {
      vi.spyOn(service, 'getSingleton').mockResolvedValue(row as never);
      const patch = vi.spyOn(service, 'patch').mockResolvedValue(row as never);

      await service.updateSingleton({ systemEventsEnabledAt: null });

      expect(patch).toHaveBeenCalledWith('ps-1', {
        systemEventsEnabledAt: null,
      });
    });

    it('rejects OpenAI moderation without an OpenAI key', async () => {
      const keyless = buildService();
      const patch = vi.spyOn(keyless, 'patch');

      await expect(
        keyless.updateSingleton({ moderationProvider: 'openai' }),
      ).rejects.toThrow('OPENAI_API_KEY');
      expect(patch).not.toHaveBeenCalled();
    });

    it('always accepts turning moderation off', async () => {
      const keyless = buildService();
      vi.spyOn(keyless, 'getSingleton').mockResolvedValue(row as never);
      const patch = vi.spyOn(keyless, 'patch').mockResolvedValue(row as never);

      await keyless.updateSingleton({ moderationProvider: 'none' });

      expect(patch).toHaveBeenCalledWith('ps-1', {
        moderationProvider: 'none',
      });
    });
  });

  describe('onModuleInit', () => {
    it('hydrates both pricing runtimes from the persisted multipliers', async () => {
      vi.spyOn(service, 'getSingleton').mockResolvedValue({
        marginMultiplierAgentChat: 2.2,
        marginMultiplierGeneration: 1.3,
      } as never);

      await service.onModuleInit();

      expect(getRuntimeMarginMultiplier()).toBe(1.3);
      expect(getRuntimeAgentChatMarginMultiplier()).toBe(2.2);
    });

    it('does not throw and keeps both defaults when hydration fails', async () => {
      vi.spyOn(service, 'getSingleton').mockRejectedValue(new Error('db down'));

      await expect(service.onModuleInit()).resolves.toBeUndefined();
      expect(logger.warn).toHaveBeenCalled();
      expect(getRuntimeMarginMultiplier()).toBe(
        DEFAULT_GENERATION_MARGIN_MULTIPLIER,
      );
      expect(getRuntimeAgentChatMarginMultiplier()).toBe(
        DEFAULT_AGENT_CHAT_MARGIN_MULTIPLIER,
      );
    });
  });
});
