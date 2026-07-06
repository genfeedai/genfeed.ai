import { DistributionsService } from '@api/collections/distributions/services/distributions.service';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { DistributionPlatform, PublishStatus } from '@genfeedai/enums';
import { LoggerService } from '@libs/logger/logger.service';
import { Test, TestingModule } from '@nestjs/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';

describe('DistributionsService', () => {
  let service: DistributionsService;

  const orgId = 'test-object-id';
  const userId = 'test-object-id';

  const mockPrismaService = {
    distribution: {
      create: vi.fn(),
      findFirst: vi.fn(),
      findMany: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(),
    },
  };

  const mockLoggerService = {
    error: vi.fn(),
    log: vi.fn(),
    warn: vi.fn(),
  };

  beforeEach(async () => {
    vi.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DistributionsService,
        { provide: PrismaService, useValue: mockPrismaService },
        { provide: LoggerService, useValue: mockLoggerService },
      ],
    }).compile();

    service = module.get<DistributionsService>(DistributionsService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('createDistribution', () => {
    it('persists a distribution scoped to the organization and user', async () => {
      mockPrismaService.distribution.create.mockResolvedValue({
        id: 'dist-id',
        organizationId: orgId,
      });

      const result = await service.createDistribution(
        orgId,
        userId,
        {
          chatId: '-1001234567890',
          text: 'Hello',
        },
        DistributionPlatform.TELEGRAM,
        PublishStatus.PUBLISHING,
      );

      expect(mockPrismaService.distribution.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            organizationId: orgId,
            status: PublishStatus.PUBLISHING,
            userId,
          }),
        }),
      );
      expect(result).toMatchObject({ _id: 'dist-id', id: 'dist-id' });
    });
  });
});
