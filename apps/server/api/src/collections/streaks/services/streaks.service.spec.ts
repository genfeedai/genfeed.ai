import { StreaksService } from '@api/collections/streaks/services/streaks.service';
import type { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { expectCloudGuardPasses } from '@api/shared/testing/cloud-guard-assertions';
import type { LoggerService } from '@libs/logger/logger.service';
import { runWithTenantContext } from '@libs/prisma/tenant-context';

describe('StreaksService tenant-scoped maintenance', () => {
  const streakRow = {
    createdAt: new Date('2026-09-01T00:00:00Z'),
    data: { currentStreak: 4, streakFreezes: 0 },
    id: 'streak-1',
    isDeleted: false,
    organizationId: 'org-1',
    updatedAt: new Date('2026-09-01T00:00:00Z'),
    userId: 'user-1',
  };
  const streak = {
    findFirst: vi.fn(),
    findMany: vi.fn(),
    update: vi.fn(),
  };
  let service: StreaksService;

  beforeEach(() => {
    vi.clearAllMocks();
    streak.findFirst.mockResolvedValue(streakRow);
    streak.findMany.mockResolvedValue([streakRow]);
    streak.update.mockResolvedValue(streakRow);
    service = new StreaksService(
      { streak } as unknown as PrismaService,
      {
        debug: vi.fn(),
        error: vi.fn(),
        log: vi.fn(),
      } as unknown as LoggerService,
      {} as never,
      {} as never,
    );
  });

  it('discovers maintenance records scoped to the organization', async () => {
    await runWithTenantContext({ organizationId: 'org-1' }, () =>
      service.discoverMaintenanceRecords({
        organizationId: 'org-1',
        referenceDate: '2026-09-10T00:00:00Z',
      }),
    );

    expect(streak.findMany).toHaveBeenCalledWith({
      where: { isDeleted: false, organizationId: 'org-1' },
    });
    expectCloudGuardPasses('Streak', 'findMany', streak.findMany);
  });

  it('persists a broken streak with an organization-scoped write', async () => {
    await runWithTenantContext({ organizationId: 'org-1' }, () =>
      service.breakMaintenanceStreak({
        currentStreak: 4,
        isAtRisk: false,
        lastActivityDate: null,
        organizationId: 'org-1',
        referenceDate: '2026-09-10T00:00:00Z',
        shouldBreak: true,
        shouldUseFreeze: false,
        streakFreezes: 0,
        streakId: 'streak-1',
        userId: 'user-1',
      }),
    );

    expect(streak.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'streak-1', isDeleted: false, organizationId: 'org-1' },
      }),
    );
    expectCloudGuardPasses('Streak', 'update', streak.update);
  });
});
