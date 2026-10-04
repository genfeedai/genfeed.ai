import { DistributionsService } from '@api/collections/distributions/services/distributions.service';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { expectCloudGuardPasses } from '@api/shared/testing/cloud-guard-assertions';
import { DistributionPlatform, PublishStatus } from '@genfeedai/contracts';
import { LoggerService } from '@libs/logger/logger.service';
import { runWithTenantContext } from '@libs/prisma/tenant-context';
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
      expect(result).toMatchObject({ id: 'dist-id' });
    });
  });
  describe('tenant-scoped status transitions', () => {
    const row = { config: {}, id: 'dist-id', organizationId: orgId };

    beforeEach(() => {
      mockPrismaService.distribution.findFirst.mockResolvedValue(row);
      mockPrismaService.distribution.update.mockResolvedValue(row);
    });

    it('pins markAsPublished and markAsFailed to the request tenant', async () => {
      await runWithTenantContext({ organizationId: orgId }, async () => {
        await service.markAsPublished('dist-id', 'tg-1');
        await service.markAsFailed('dist-id', 'boom');
      });

      expect(mockPrismaService.distribution.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'dist-id', isDeleted: false, organizationId: orgId },
        }),
      );
      expectCloudGuardPasses(
        'Distribution',
        'findFirst',
        mockPrismaService.distribution.findFirst,
      );
      expectCloudGuardPasses(
        'Distribution',
        'update',
        mockPrismaService.distribution.update,
      );
    });

    it('prefers an explicit organization over the request tenant', async () => {
      await service.markAsFailed('dist-id', 'boom', 'org-from-worker');

      expect(mockPrismaService.distribution.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            id: 'dist-id',
            isDeleted: false,
            organizationId: 'org-from-worker',
          },
        }),
      );
    });

    it('scopes the cancelScheduled write by organization', async () => {
      mockPrismaService.distribution.findFirst.mockResolvedValue({
        ...row,
        status: PublishStatus.SCHEDULED,
      });

      await runWithTenantContext({ organizationId: orgId }, () =>
        service.cancelScheduled('dist-id', orgId),
      );

      expectCloudGuardPasses(
        'Distribution',
        'update',
        mockPrismaService.distribution.update,
      );
    });
  });
});
