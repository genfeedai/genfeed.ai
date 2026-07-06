import { PlatformSettingsService } from '@api/collections/platform-settings/services/platform-settings.service';
import { PLATFORM_SETTING_KEY } from '@genfeedai/constants';
import {
  getRuntimeMarginMultiplier,
  setRuntimeMarginMultiplier,
} from '@genfeedai/helpers';
import { Prisma } from '@genfeedai/prisma';
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

  beforeEach(() => {
    vi.clearAllMocks();
    setRuntimeMarginMultiplier(1);
    service = new PlatformSettingsService(
      prisma as never,
      logger as LoggerService,
    );
  });

  afterEach(() => {
    setRuntimeMarginMultiplier(1);
  });

  describe('getSingleton', () => {
    it('returns the existing singleton row without creating', async () => {
      const row = {
        id: 'ps-1',
        key: PLATFORM_SETTING_KEY,
        marginMultiplier: 1.2,
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
        marginMultiplier: 1,
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
        marginMultiplier: 1,
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
    it('patches the singleton and hydrates the pricing runtime', async () => {
      const current = {
        id: 'ps-1',
        key: PLATFORM_SETTING_KEY,
        marginMultiplier: 1,
      };
      const updated = { ...current, marginMultiplier: 1.5 };
      vi.spyOn(service, 'getSingleton').mockResolvedValue(current as never);
      const patch = vi
        .spyOn(service, 'patch')
        .mockResolvedValue(updated as never);

      const result = await service.updateSingleton({ marginMultiplier: 1.5 });

      expect(patch).toHaveBeenCalledWith('ps-1', { marginMultiplier: 1.5 });
      expect(result).toBe(updated);
      expect(getRuntimeMarginMultiplier()).toBe(1.5);
    });

    it('never patches the singleton key even if one is smuggled in', async () => {
      const current = {
        id: 'ps-1',
        key: PLATFORM_SETTING_KEY,
        marginMultiplier: 1,
      };
      vi.spyOn(service, 'getSingleton').mockResolvedValue(current as never);
      const patch = vi
        .spyOn(service, 'patch')
        .mockResolvedValue({ ...current, marginMultiplier: 2 } as never);

      await service.updateSingleton({
        key: 'rogue',
        marginMultiplier: 2,
      } as never);

      expect(patch).toHaveBeenCalledWith('ps-1', { marginMultiplier: 2 });
    });

    it('short-circuits when no editable fields are provided', async () => {
      const current = {
        id: 'ps-1',
        key: PLATFORM_SETTING_KEY,
        marginMultiplier: 1,
      };
      vi.spyOn(service, 'getSingleton').mockResolvedValue(current as never);
      const patch = vi.spyOn(service, 'patch');

      const result = await service.updateSingleton({});

      expect(result).toBe(current);
      expect(patch).not.toHaveBeenCalled();
      expect(getRuntimeMarginMultiplier()).toBe(1);
    });
  });

  describe('onModuleInit', () => {
    it('hydrates the pricing runtime from the persisted multiplier', async () => {
      vi.spyOn(service, 'getSingleton').mockResolvedValue({
        marginMultiplier: 1.3,
      } as never);

      await service.onModuleInit();

      expect(getRuntimeMarginMultiplier()).toBe(1.3);
    });

    it('does not throw and keeps the default when hydration fails', async () => {
      vi.spyOn(service, 'getSingleton').mockRejectedValue(new Error('db down'));

      await expect(service.onModuleInit()).resolves.toBeUndefined();
      expect(logger.warn).toHaveBeenCalled();
      expect(getRuntimeMarginMultiplier()).toBe(1);
    });
  });
});
