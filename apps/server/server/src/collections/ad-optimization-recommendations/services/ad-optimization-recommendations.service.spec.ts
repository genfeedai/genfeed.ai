import type { ServerLogger, ServerPrisma } from '@server/server.dependencies';
import { AdOptimizationRecommendationsService } from './ad-optimization-recommendations.service';

describe('AdOptimizationRecommendationsService', () => {
  const createMany = vi.fn();
  const logger = {
    error: vi.fn(),
    log: vi.fn(),
    warn: vi.fn(),
  } satisfies ServerLogger;
  const prisma = {
    adOptimizationRecommendation: { createMany },
  } as unknown as Pick<ServerPrisma, 'adOptimizationRecommendation'>;
  const service = new AdOptimizationRecommendationsService(prisma, logger);

  beforeEach(() => {
    vi.clearAllMocks();
    createMany.mockResolvedValue({ count: 1 });
  });

  it('persists the canonical organization id for every recommendation', async () => {
    await service.createBatch([
      {
        entityId: 'ad-1',
        organizationId: 'org-1',
        recommendationType: 'pause',
      },
    ]);

    expect(createMany).toHaveBeenCalledWith({
      data: [
        expect.objectContaining({
          organizationId: 'org-1',
        }),
      ],
      skipDuplicates: true,
    });
  });

  it('rejects recommendations without canonical tenant ownership', async () => {
    await expect(
      service.createBatch([
        {
          entityId: 'ad-1',
          recommendationType: 'pause',
        },
      ]),
    ).rejects.toThrowError(
      'Ad optimization recommendation organizationId is required',
    );
    expect(createMany).not.toHaveBeenCalled();
  });
});
