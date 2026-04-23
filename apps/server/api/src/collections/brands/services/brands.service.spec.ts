import { NotFoundException } from '@api/helpers/exceptions/http/not-found.exception';

vi.mock('@genfeedai/prisma', () => ({ PrismaClient: class {} }));

import { BrandsService } from '@api/collections/brands/services/brands.service';
import { CacheInvalidationService } from '@api/common/services/cache-invalidation.service';
import { BrandScraperService } from '@api/services/brand-scraper/brand-scraper.service';
import { CacheService } from '@api/services/cache/services/cache.service';
import { LlmDispatcherService } from '@api/services/integrations/llm/llm-dispatcher.service';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { LoggerService } from '@libs/logger/logger.service';

describe('BrandsService', () => {
  let service: BrandsService;
  let delegate: Record<string, ReturnType<typeof vi.fn>>;

  beforeEach(() => {
    delegate = {
      count: vi.fn(),
      create: vi.fn(),
      delete: vi.fn(),
      findFirst: vi.fn(),
      findMany: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
    };

    const prisma = {
      _runtimeDataModel: {
        models: {
          Brand: {
            fields: [
              { name: 'id' },
              { name: 'mongoId' },
              { name: 'organizationId' },
              { name: 'userId' },
              { name: 'isDeleted' },
            ],
          },
        },
      },
      brand: delegate,
    } as unknown as PrismaService;

    service = new BrandsService(
      prisma,
      {
        debug: vi.fn(),
        error: vi.fn(),
        log: vi.fn(),
        warn: vi.fn(),
      } as unknown as LoggerService,
      {} as CacheService,
      {} as BrandScraperService,
      {} as LlmDispatcherService,
      {
        invalidate: vi.fn(),
        invalidatePattern: vi.fn(),
      } as unknown as CacheInvalidationService,
    );
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('resolves legacy mongo ids before selecting a brand', async () => {
    const legacyBrandId = '69d65211cbce660360fd068d';
    const currentBrandId = 'hkh2jbovtpcsrzw3oyxr11oj';
    const organizationId = 'b13yktd0f1e38me3f55swu0n';
    const userId = 'user_current';

    delegate.findFirst
      .mockResolvedValueOnce({
        id: currentBrandId,
        isDeleted: false,
        mongoId: legacyBrandId,
        organizationId,
        userId,
      })
      .mockResolvedValueOnce({
        id: currentBrandId,
        isDeleted: false,
        isSelected: true,
        mongoId: legacyBrandId,
        organizationId,
        userId,
      });
    delegate.updateMany.mockResolvedValue({ count: 1 });

    const result = await service.selectBrandForUser(
      legacyBrandId,
      userId,
      organizationId,
    );

    expect(delegate.findFirst).toHaveBeenNthCalledWith(1, {
      where: {
        OR: [{ id: legacyBrandId }, { mongoId: legacyBrandId }],
        isDeleted: false,
        organizationId,
      },
    });
    expect(delegate.updateMany).toHaveBeenNthCalledWith(2, {
      data: { isSelected: true },
      where: { id: currentBrandId, isDeleted: false, organizationId },
    });
    expect(result).toMatchObject({
      _id: legacyBrandId,
      id: currentBrandId,
      isSelected: true,
    });
  });

  it('throws when the target brand cannot be resolved', async () => {
    delegate.findFirst.mockResolvedValue(null);

    await expect(
      service.selectBrandForUser(
        'brand_missing',
        'user_current',
        'org_current',
      ),
    ).rejects.toThrow(NotFoundException);
    expect(delegate.updateMany).not.toHaveBeenCalled();
  });
});
