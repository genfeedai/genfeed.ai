import {
  FontFamilySeedService,
  fontFamilyId,
} from '@api/seeds/font-family-seed.service';
import type { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { FONT_FAMILY_METADATA } from '@genfeedai/contracts';
import type { LoggerService } from '@libs/logger/logger.service';
import { describe, expect, it, vi } from 'vitest';

function fixture() {
  const create = vi.fn().mockResolvedValue({});
  const findFirst = vi.fn().mockResolvedValue(null);
  const logger = { error: vi.fn(), log: vi.fn() };
  return {
    create,
    findFirst,
    logger,
    service: new FontFamilySeedService(
      { fontFamilyRecord: { create, findFirst } } as unknown as PrismaService,
      logger as unknown as LoggerService,
    ),
  };
}

describe('FontFamilySeedService', () => {
  const entries = Object.values(FONT_FAMILY_METADATA);

  it('inserts missing platform rows with deterministic ids and skips existing ones', async () => {
    const { create, findFirst, service } = fixture();

    const first = await service.reconcileCatalog();
    expect(first.written).toBe(entries.length);
    expect(create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        id: fontFamilyId('poppins-bold'),
        key: 'poppins-bold',
        label: 'Poppins Bold',
        organizationId: null,
      }),
    });

    findFirst.mockResolvedValue({ id: 'existing' });
    create.mockClear();
    const second = await service.reconcileCatalog();
    expect(second).toEqual({
      failed: [],
      unchanged: entries.length,
      written: 0,
    });
    expect(create).not.toHaveBeenCalled();
  });

  it('attempts every entry then fails closed', async () => {
    const { create, logger, service } = fixture();
    create.mockRejectedValue(new Error('write failed'));

    await expect(service.reconcileCatalog()).rejects.toThrow(
      'Font family reconcile failed for:',
    );
    expect(create).toHaveBeenCalledTimes(entries.length);
    expect(logger.error).toHaveBeenCalled();
  });
});
