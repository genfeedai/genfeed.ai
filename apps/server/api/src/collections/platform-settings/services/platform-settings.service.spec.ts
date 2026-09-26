import { PlatformSettingsService } from '@api/collections/platform-settings/services/platform-settings.service';
import { PLATFORM_SETTING_KEY } from '@genfeedai/contracts/constants';
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
  const prisma = { platformSetting: {} };
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
    service = buildService({ TYPESAFE_API_KEY: 'typesafe-key' });
  });

  afterEach(() => {
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
