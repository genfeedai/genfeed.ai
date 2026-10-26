import { OrganizationsReportService } from '@api/endpoints/admin/organizations-report/organizations-report.service';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { Test } from '@nestjs/testing';
import { vi } from 'vitest';

describe('OrganizationsReportService', () => {
  const findMany = vi.fn();
  const count = vi.fn();
  let service: OrganizationsReportService;

  beforeEach(async () => {
    findMany.mockReset();
    count.mockReset();
    count.mockResolvedValue(0);
    const module = await Test.createTestingModule({
      providers: [
        OrganizationsReportService,
        {
          provide: PrismaService,
          useValue: { organization: { count, findMany } },
        },
      ],
    }).compile();
    service = module.get(OrganizationsReportService);
  });

  it('pages non-deleted organizations in the database, oldest first', async () => {
    findMany.mockResolvedValue([]);
    count.mockResolvedValue(45);

    const report = await service.getReport({ limit: 20, page: 2, skip: 20 });

    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
        skip: 20,
        take: 20,
        where: { isDeleted: false },
      }),
    );
    expect(count).toHaveBeenCalledWith({ where: { isDeleted: false } });
    expect(report.pagination).toEqual({
      limit: 20,
      page: 2,
      pages: 3,
      total: 45,
    });
  });

  it('includes soft-deleted organizations when asked', async () => {
    findMany.mockResolvedValue([]);

    await service.getReport({ limit: 20, page: 1, skip: 0 }, true);

    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: {} }),
    );
    expect(count).toHaveBeenCalledWith({ where: {} });
  });

  it('maps owner, tier, category and member count per organization', async () => {
    findMany.mockResolvedValue([
      {
        _count: { members: 3 },
        accountType: null,
        category: 'BUSINESS',
        createdAt: new Date('2026-01-02T03:04:05.000Z'),
        id: 'org_1',
        isDeleted: false,
        label: 'Acme',
        onboardingCompleted: true,
        settings: { subscriptionTier: 'pro' },
        slug: 'acme',
        user: { email: 'owner@acme.test' },
      },
      {
        _count: { members: 0 },
        accountType: 'AGENCY',
        category: 'BUSINESS',
        createdAt: new Date('2026-02-02T00:00:00.000Z'),
        id: 'org_2',
        isDeleted: true,
        label: 'Gone',
        onboardingCompleted: false,
        settings: null,
        slug: 'gone',
        user: { email: null },
      },
    ]);

    const report = await service.getReport(
      { limit: 20, page: 1, skip: 0 },
      true,
    );

    expect(report.organizations).toEqual([
      {
        category: 'BUSINESS',
        createdAt: '2026-01-02T03:04:05.000Z',
        id: 'org_1',
        isDeleted: false,
        isOnboardingCompleted: true,
        label: 'Acme',
        memberCount: 3,
        ownerEmail: 'owner@acme.test',
        slug: 'acme',
        subscriptionTier: 'pro',
      },
      {
        category: 'AGENCY',
        createdAt: '2026-02-02T00:00:00.000Z',
        id: 'org_2',
        isDeleted: true,
        isOnboardingCompleted: false,
        label: 'Gone',
        memberCount: 0,
        ownerEmail: null,
        slug: 'gone',
        subscriptionTier: null,
      },
    ]);
  });
});
