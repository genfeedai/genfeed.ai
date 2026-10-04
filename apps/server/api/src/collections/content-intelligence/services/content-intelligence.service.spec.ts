import { ContentIntelligenceService } from '@api/collections/content-intelligence/services/content-intelligence.service';
import { NotFoundException } from '@api/exceptions/not-found.exception';
import {
  ContentIntelligencePlatform,
  CreatorAnalysisStatus,
} from '@genfeedai/contracts';
import { runWithTenantContext } from '@libs/prisma/tenant-context';
import {
  assertTenantScopedQuery,
  TenantIsolationError,
} from '@libs/prisma/tenant-guard';

describe('ContentIntelligenceService Prisma boundary', () => {
  const create = vi.fn();
  const findFirst = vi.fn();
  const update = vi.fn();
  const organizationId = '550e8400-e29b-41d4-a716-446655440001';
  const userId = '550e8400-e29b-41d4-a716-446655440002';
  let service: ContentIntelligenceService;

  beforeEach(() => {
    vi.clearAllMocks();
    create.mockImplementation(async ({ data }) => ({
      createdAt: new Date(),
      id: 'creator-1',
      isDeleted: false,
      updatedAt: new Date(),
      ...data,
    }));
    service = new ContentIntelligenceService(
      {
        creatorAnalysis: { create, findFirst, update },
      } as never,
      { debug: vi.fn(), error: vi.fn(), log: vi.fn(), warn: vi.fn() } as never,
    );
  });

  it('stores creator domain fields in data and ownership in scalar columns', async () => {
    const result = await service.addCreator(organizationId, userId, {
      handle: '@creator',
      platform: ContentIntelligencePlatform.TWITTER,
    });

    expect(create).toHaveBeenCalledWith({
      data: {
        createdById: userId,
        data: expect.objectContaining({
          handle: '@creator',
          platform: ContentIntelligencePlatform.TWITTER,
          status: CreatorAnalysisStatus.PENDING,
        }),
        organizationId,
      },
    });
    expect(result).toMatchObject({
      handle: '@creator',
      organizationId,
    });
  });

  it('queries creator identity through canonical JSON paths', async () => {
    findFirst.mockResolvedValue(null);

    await service.findByHandle(
      organizationId,
      ContentIntelligencePlatform.TWITTER,
      '@creator',
    );

    expect(findFirst).toHaveBeenCalledWith({
      where: {
        AND: [
          { data: { equals: '@creator', path: ['handle'] } },
          {
            data: {
              equals: ContentIntelligencePlatform.TWITTER,
              path: ['platform'],
            },
          },
        ],
        isDeleted: false,
        organizationId,
      },
    });
  });

  it('returns the canonical 404 when updating a missing creator analysis', async () => {
    findFirst.mockResolvedValue(null);

    try {
      await service.updateStatus(
        'creator-missing',
        organizationId,
        CreatorAnalysisStatus.FAILED,
      );
      expect.unreachable('expected a NotFoundException');
    } catch (error: unknown) {
      expect(error).toBeInstanceOf(NotFoundException);
      expect((error as NotFoundException).getStatus()).toBe(404);
      expect(error).toMatchObject({ message: 'Creator analysis not found' });
    }

    expect(update).not.toHaveBeenCalled();
  });
  describe('CLOUD tenant guard', () => {
    function guardDelegate(): void {
      const guard = (operation: string) => (args: unknown) =>
        assertTenantScopedQuery({
          args,
          isCloud: true,
          model: 'CreatorAnalysis',
          operation,
          tenantModelNames: new Set(['CreatorAnalysis']),
        });
      const checkFindFirst = guard('findFirst');
      const checkUpdate = guard('update');
      findFirst.mockImplementation(async (args: unknown) => {
        checkFindFirst(args);
        return {
          data: { handle: '@creator' },
          id: 'creator-1',
          organizationId,
        };
      });
      update.mockImplementation(
        async (args: { data: Record<string, unknown> }) => {
          checkUpdate(args);
          return { id: 'creator-1', organizationId, ...args.data };
        },
      );
    }

    it('updates status with an organization-scoped lookup and write', async () => {
      guardDelegate();

      const result = await runWithTenantContext({ organizationId }, () =>
        service.updateStatus(
          'creator-1',
          organizationId,
          CreatorAnalysisStatus.ANALYZING,
        ),
      );

      expect(findFirst).toHaveBeenCalledWith({
        where: { id: 'creator-1', isDeleted: false, organizationId },
      });
      expect(update).toHaveBeenCalledWith({
        data: {
          data: {
            handle: '@creator',
            status: CreatorAnalysisStatus.ANALYZING,
          },
        },
        where: { id: 'creator-1', isDeleted: false, organizationId },
      });
      expect(result).toMatchObject({ organizationId });
    });

    it('updates metrics and profile through the same scoped path', async () => {
      guardDelegate();

      await runWithTenantContext({ organizationId }, async () => {
        await service.updateMetrics(
          'creator-1',
          organizationId,
          { x: 1 },
          5,
          2,
        );
        await service.updateCreatorProfile('creator-1', organizationId, {
          displayName: 'Creator',
        });
      });

      expect(update).toHaveBeenCalledTimes(2);
    });

    it('refuses to touch a creator outside the request tenant', async () => {
      guardDelegate();

      await expect(
        runWithTenantContext({ organizationId: 'org-other' }, () =>
          service.updateStatus(
            'creator-1',
            organizationId,
            CreatorAnalysisStatus.FAILED,
          ),
        ),
      ).rejects.toBeInstanceOf(TenantIsolationError);
      expect(update).not.toHaveBeenCalled();
    });
  });
});
