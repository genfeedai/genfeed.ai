import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { LoggerService } from '@libs/logger/logger.service';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  buildVideoGenerationLineageMetadata,
  buildVideoGenerationLineageReferenceId,
  parseVideoGenerationLineageMetadata,
  sumVideoGenerationLineageSpend,
  VIDEO_GENERATION_LINEAGE_REFERENCE_TYPE,
  VideoGenerationLineageService,
} from './video-generation-lineage.service';

describe('video generation lineage credit helper', () => {
  it('stores lineage on existing transaction metadata rather than a new table', () => {
    const metadata = buildVideoGenerationLineageMetadata({
      accepted: null,
      attemptKind: 'pilot',
      attemptNumber: 1,
      lineageId: 'lineage-1',
    });

    expect(metadata).toEqual({
      accepted: null,
      attemptKind: 'pilot',
      attemptNumber: 1,
      lineageId: 'lineage-1',
    });
    expect(buildVideoGenerationLineageReferenceId('lineage-1', 'full', 2)).toBe(
      'lineage-1:full:2',
    );
    expect(VIDEO_GENERATION_LINEAGE_REFERENCE_TYPE).toBe(
      'video-generation-lineage',
    );
    expect(parseVideoGenerationLineageMetadata(metadata)).toEqual({
      accepted: null,
      attemptKind: 'pilot',
      attemptNumber: 1,
      lineageId: 'lineage-1',
    });
  });

  it('sums pilot and full-run spend for one accepted output', () => {
    const total = sumVideoGenerationLineageSpend(
      [
        {
          amount: 5,
          metadata: buildVideoGenerationLineageMetadata({
            accepted: true,
            attemptKind: 'pilot',
            attemptNumber: 1,
            lineageId: 'lineage-1',
          }),
        },
        {
          amount: 10,
          metadata: buildVideoGenerationLineageMetadata({
            accepted: true,
            attemptKind: 'full',
            attemptNumber: 2,
            lineageId: 'lineage-1',
          }),
        },
        {
          amount: 10,
          metadata: buildVideoGenerationLineageMetadata({
            accepted: false,
            attemptKind: 'pilot',
            attemptNumber: 1,
            lineageId: 'other-lineage',
          }),
        },
      ],
      'lineage-1',
    );

    expect(total).toBe(15);
  });

  it('rejects metadata that is missing lineage fields', () => {
    expect(
      parseVideoGenerationLineageMetadata({ brandId: 'brand-1' }),
    ).toBeNull();
    expect(parseVideoGenerationLineageMetadata(null)).toBeNull();
  });
});

describe('VideoGenerationLineageService', () => {
  const prisma = {
    creditTransaction: {
      findMany: vi.fn(),
    },
  };
  const loggerService = { warn: vi.fn() };

  function buildService(): VideoGenerationLineageService {
    return new VideoGenerationLineageService(
      prisma as unknown as PrismaService,
      loggerService as unknown as LoggerService,
    );
  }

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('lists ledger rows for a lineage with organization and soft-delete scope', async () => {
    prisma.creditTransaction.findMany.mockResolvedValue([
      {
        amount: 5,
        metadata: {
          attemptKind: 'pilot',
          attemptNumber: 1,
          lineageId: 'lineage-1',
          accepted: true,
        },
      },
      {
        amount: 10,
        metadata: {
          attemptKind: 'full',
          attemptNumber: 2,
          lineageId: 'lineage-1',
          accepted: true,
        },
      },
    ]);

    const service = buildService();
    const total = await service.sumSpendByLineageId('org-1', 'lineage-1');

    expect(prisma.creditTransaction.findMany).toHaveBeenCalledWith({
      orderBy: { createdAt: 'asc' },
      where: expect.objectContaining({
        isDeleted: false,
        organizationId: 'org-1',
        metadata: {
          equals: 'lineage-1',
          path: ['lineageId'],
        },
      }),
    });
    expect(total).toBe(15);
  });

  it('returns zero when organization or lineage id is missing', async () => {
    const service = buildService();
    expect(await service.sumSpendByLineageId('', 'lineage-1')).toBe(0);
    expect(await service.listByLineageId('org-1', '  ')).toEqual([]);
    expect(prisma.creditTransaction.findMany).not.toHaveBeenCalled();
  });
});
