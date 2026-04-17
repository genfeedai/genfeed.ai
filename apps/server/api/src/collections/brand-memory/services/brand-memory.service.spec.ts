import {
  BrandMemory,
  type BrandMemoryDocument,
} from '@api/collections/brand-memory/schemas/brand-memory.schema';
import { BrandMemoryService } from '@api/collections/brand-memory/services/brand-memory.service';
import { DB_CONNECTIONS } from '@api/constants/database.constants';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { LoggerService } from '@libs/logger/logger.service';
import { Test, type TestingModule } from '@nestjs/testing';
import { vi } from 'vitest';

interface QueryChain<T> {
  sort: (value: Record<string, 1 | -1>) => QueryChain<T>;
  limit: (value: number) => QueryChain<T>;
  lean: () => { exec: () => Promise<T> };
}

describe('BrandMemoryService', () => {
  let service: BrandMemoryService;

  const mockModel = {
    aggregate: vi.fn(),
    find: vi.fn(),
    findOneAndUpdate: vi.fn(),
  };

  const mockLogger = {
    debug: vi.fn(),
    error: vi.fn(),
    log: vi.fn(),
    warn: vi.fn(),
  };

  const orgId = 'test-object-id'.toString();
  const brandId = 'test-object-id'.toString();

  beforeEach(async () => {
    vi.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BrandMemoryService,
        { provide: PrismaService, useValue: mockModel },
        {
          provide: LoggerService,
          useValue: mockLogger,
        },
      ],
    }).compile();

    service = module.get<BrandMemoryService>(BrandMemoryService);
  });

  it('should append a log entry to today document', async () => {
    mockModel.findOneAndUpdate.mockResolvedValue({ _id: 'test-object-id' });

    await service.logEntry(orgId, brandId, {
      content: 'Post published with strong retention',
      type: 'performance',
    });

    expect(mockModel.findOneAndUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        brand: new string(brandId),
        isDeleted: false,
        organization: new string(orgId),
      }),
      expect.objectContaining({
        $push: expect.objectContaining({
          entries: expect.objectContaining({
            content: 'Post published with strong retention',
            type: 'performance',
          }),
        }),
      }),
      { new: true, upsert: true },
    );
  });

  it('should return latest insights with limit', async () => {
    const expectedInsights = [
      {
        category: 'format',
        confidence: 0.9,
        createdAt: new Date(),
        insight: 'Short-form video outperforms static image.',
        source: 'distiller',
      },
    ];

    const chain: QueryChain<BrandMemoryDocument[]> = {
      lean: () => ({ exec: async () => [] }),
      limit: () => chain,
      sort: () => chain,
    };

    chain.lean = () => ({
      exec: async () =>
        [
          {
            insights: expectedInsights,
          },
        ] as unknown as BrandMemoryDocument[],
    });

    mockModel.find.mockReturnValue(chain);

    const insights = await service.getInsights(orgId, brandId, 1);

    expect(insights).toEqual(expectedInsights);
    expect(mockModel.find).toHaveBeenCalledWith(
      expect.objectContaining({
        brand: new string(brandId),
        isDeleted: false,
        organization: new string(orgId),
      }),
    );
  });

  it('should distill long-term memory from last 30 days', async () => {
    mockModel.aggregate.mockResolvedValue([
      {
        _id: 'video',
        avgEngagementRate: 7.4,
        count: 8,
      },
    ]);
    mockModel.findOneAndUpdate.mockResolvedValue({ _id: 'test-object-id' });

    const result = await service.distillLongTermMemory(orgId, brandId);

    expect(result.length).toBeGreaterThan(0);
    expect(result[0].category).toBe('format');
    expect(mockModel.findOneAndUpdate).toHaveBeenCalled();
  });
});
