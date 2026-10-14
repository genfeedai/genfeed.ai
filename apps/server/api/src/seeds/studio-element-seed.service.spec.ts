import {
  STUDIO_ELEMENT_CATALOG,
  studioElementId,
} from '@api/seeds/studio-element-catalog';
import { StudioElementSeedService } from '@api/seeds/studio-element-seed.service';
import type { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import type { LoggerService } from '@libs/logger/logger.service';
import { describe, expect, it, vi } from 'vitest';

function fixture() {
  const create = vi.fn().mockResolvedValue({});
  const findFirst = vi.fn().mockResolvedValue(null);
  const delegate = { create, findFirst };
  const prisma = {
    elementCamera: delegate,
    elementCameraMovement: delegate,
    elementLens: delegate,
    elementLighting: delegate,
    elementMood: delegate,
    elementScene: delegate,
    elementSound: delegate,
    elementStyle: delegate,
  };
  const logger = {
    error: vi.fn(),
    log: vi.fn(),
  };
  return {
    create,
    findFirst,
    logger,
    prisma,
    service: new StudioElementSeedService(
      prisma as unknown as PrismaService,
      logger as unknown as LoggerService,
    ),
  };
}

describe('StudioElementSeedService', () => {
  it('inserts missing platform rows with deterministic ids and skips existing ones', async () => {
    const { create, findFirst, service } = fixture();
    const styles = STUDIO_ELEMENT_CATALOG.find(
      (domain) => domain.table === 'elements_styles',
    );
    if (!styles) throw new Error('expected styles catalog');

    const first = await service.reconcileCatalog([styles]);
    expect(first.written).toBe(styles.entries.length);
    expect(first.unchanged).toBe(0);
    expect(create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        id: studioElementId('elements_styles', 'photoreal'),
        key: 'photoreal',
        organizationId: null,
        isActive: true,
      }),
    });

    findFirst.mockResolvedValue({ id: 'existing' });
    create.mockClear();
    const second = await service.reconcileCatalog([styles]);
    expect(second).toEqual({
      failed: [],
      unchanged: styles.entries.length,
      written: 0,
    });
    expect(create).not.toHaveBeenCalled();
  });

  it('attempts every entry then fails closed', async () => {
    const { create, logger, service } = fixture();
    const styles = STUDIO_ELEMENT_CATALOG.find(
      (domain) => domain.table === 'elements_styles',
    );
    if (!styles) throw new Error('expected styles catalog');
    create.mockRejectedValue(new Error('write failed'));

    await expect(service.reconcileCatalog([styles])).rejects.toThrow(
      'Studio element reconcile failed for:',
    );
    expect(create).toHaveBeenCalledTimes(styles.entries.length);
    expect(logger.error).toHaveBeenCalled();
  });
});
