import { OrganizationsReportService } from '@api/endpoints/admin/organizations-report/organizations-report.service';
import type { PrismaService } from '@api/shared/modules/prisma/prisma.service';

type OrganizationRow = {
  _count: { members: number };
  accountType: string | null;
  category: string;
  createdAt: Date;
  id: string;
  isDeleted: boolean;
  label: string;
  onboardingCompleted: boolean;
  settings: { subscriptionTier: string } | null;
  slug: string;
  user: { email: string | null };
};

function organization(
  id: string,
  createdAt: string,
  overrides: Partial<OrganizationRow> = {},
): OrganizationRow {
  return {
    _count: { members: 1 },
    accountType: null,
    category: 'BUSINESS',
    createdAt: new Date(createdAt),
    id,
    isDeleted: false,
    label: id,
    onboardingCompleted: true,
    settings: null,
    slug: id,
    user: { email: `${id}@example.test` },
    ...overrides,
  };
}

/** The organizations table, ordered by `createdAt` then `id`. */
function buildService(rows: OrganizationRow[]) {
  const visible = (where: { isDeleted?: boolean }) =>
    rows.filter(
      (row) =>
        where.isDeleted === undefined || row.isDeleted === where.isDeleted,
    );
  const prisma = {
    organization: {
      count: async ({ where }: { where: { isDeleted?: boolean } }) =>
        visible(where).length,
      findMany: async (args: {
        skip: number;
        take: number;
        where: { isDeleted?: boolean };
      }) =>
        visible(args.where)
          .sort(
            (a, b) =>
              Number(a.createdAt) - Number(b.createdAt) ||
              a.id.localeCompare(b.id),
          )
          .slice(args.skip, args.skip + args.take),
    },
  };
  return new OrganizationsReportService(prisma as unknown as PrismaService);
}

describe('OrganizationsReportService', () => {
  const rows = () => [
    organization('org-c', '2026-03-01T00:00:00.000Z'),
    organization('org-gone', '2026-01-15T00:00:00.000Z', { isDeleted: true }),
    organization('org-b', '2026-02-01T00:00:00.000Z'),
    organization('org-a2', '2026-01-01T00:00:00.000Z'),
    organization('org-a1', '2026-01-01T00:00:00.000Z'),
  ];

  it('pages non-deleted organizations in the database, oldest first', async () => {
    const report = await buildService(rows()).getReport({
      limit: 2,
      page: 2,
      skip: 2,
    });

    expect(report.organizations.map((row) => row.id)).toEqual([
      'org-b',
      'org-c',
    ]);
    expect(report.pagination).toEqual({
      limit: 2,
      page: 2,
      pages: 2,
      total: 4,
    });
  });

  it('includes soft-deleted organizations when asked', async () => {
    const report = await buildService(rows()).getReport(
      { limit: 20, page: 1, skip: 0 },
      true,
    );

    expect(report.organizations.map((row) => row.id)).toEqual([
      'org-a1',
      'org-a2',
      'org-gone',
      'org-b',
      'org-c',
    ]);
    expect(report.pagination.total).toBe(5);
  });

  it('maps owner, tier, category and member count per organization', async () => {
    const report = await buildService([
      organization('org_1', '2026-01-02T03:04:05.000Z', {
        _count: { members: 3 },
        label: 'Acme',
        settings: { subscriptionTier: 'pro' },
        slug: 'acme',
        user: { email: 'owner@acme.test' },
      }),
      organization('org_2', '2026-02-02T00:00:00.000Z', {
        _count: { members: 0 },
        accountType: 'AGENCY',
        isDeleted: true,
        label: 'Gone',
        onboardingCompleted: false,
        slug: 'gone',
        user: { email: null },
      }),
    ]).getReport({ limit: 20, page: 1, skip: 0 }, true);

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
