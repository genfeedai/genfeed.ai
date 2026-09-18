import { OutlierConfigurationService } from '@api/collections/outliers/services/outlier-configuration.service';
import type { PrismaService } from '@api/shared/modules/prisma/prisma.service';

describe('OutlierConfigurationService', () => {
  it('recovers from a concurrent first create', async () => {
    const create = vi.fn().mockRejectedValue({ code: 'P2002' });
    const updateMany = vi.fn().mockResolvedValue({ count: 1 });
    const findFirst = vi
      .fn()
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null)
      .mockResolvedValue({
        id: 'cfg',
        windowSize: 10,
        minimumSampleSize: 5,
        outlierThreshold: 3,
        breakoutThreshold: 10,
        maturityHoursByPlatform: {},
      });
    const service = new OutlierConfigurationService({
      outlierConfiguration: { create, findFirst, updateMany },
    } as unknown as PrismaService);

    const result = await service.update('org', { windowSize: 10 });
    expect(create).toHaveBeenCalled();
    expect(updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { organizationId: 'org' },
        data: expect.objectContaining({
          isDeleted: false,
          windowSize: 10,
        }),
      }),
    );
    expect(result.windowSize).toBe(10);
  });
});
