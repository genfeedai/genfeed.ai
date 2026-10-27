import type { PostsService } from '@api/collections/posts/services/posts.service';
import { XGrowthReportService } from '@api/endpoints/analytics/x-growth-report/x-growth-report.service';
import type {
  PublicationInsight,
  PublicationInsightsQuery,
} from '@genfeedai/contracts/interfaces/content/publication-insights.interface';
import type { PrismaService } from '@libs/prisma/prisma.service';

const NOW = new Date('2026-10-27T12:00:00.000Z');
const SCOPE = { brandId: 'brand-1', organizationId: 'org-1', userId: 'user-1' };
const PERIOD = {
  from: '2026-10-01T00:00:00.000Z',
  to: '2026-10-08T00:00:00.000Z',
};

interface CredentialRow {
  brandId: string;
  externalHandle: string;
  id: string;
  organizationId: string;
}

function setup(options: {
  credentials?: CredentialRow[];
  posts?: Array<Record<string, unknown>>;
  pages?: Array<{
    docs: Array<Partial<PublicationInsight>>;
    hasNextPage: boolean;
  }>;
}) {
  const queries: PublicationInsightsQuery[] = [];
  const pages = [...(options.pages ?? [{ docs: [], hasNextPage: false }])];
  const postsService = {
    async getPublicationInsights(query: PublicationInsightsQuery) {
      queries.push(query);
      return pages.shift() ?? { docs: [], hasNextPage: false };
    },
  } as unknown as PostsService;
  const credentials = options.credentials ?? [
    {
      brandId: 'brand-1',
      externalHandle: 'genfeedai',
      id: 'cred-1',
      organizationId: 'org-1',
    },
  ];
  const prisma = {
    accountAnalyticsSnapshot: { findMany: async () => [] },
    post: {
      findMany: async ({ where }: { where: Record<string, unknown> }) =>
        (options.posts ?? []).filter(
          (row) =>
            row.organizationId === where.organizationId &&
            row.brandId === where.brandId &&
            (where.id as { in: string[] }).in.includes(row.id as string),
        ),
    },
    credential: {
      findFirst: async ({ where }: { where: Record<string, unknown> }) =>
        credentials.find(
          (row) =>
            row.id === where.id &&
            row.brandId === where.brandId &&
            row.organizationId === where.organizationId,
        ) ?? null,
    },
  } as unknown as PrismaService;
  return { queries, service: new XGrowthReportService(postsService, prisma) };
}

describe('XGrowthReportService', () => {
  it('reads the selected account and period only, and binds the report to them', async () => {
    const { queries, service } = setup({});

    const report = await service.build(
      SCOPE,
      { credentialId: 'cred-1', period: PERIOD },
      NOW,
    );

    expect(queries).toEqual([
      expect.objectContaining({
        brandId: 'brand-1',
        credentialId: ['cred-1'],
        platform: 'twitter',
        publishedFrom: PERIOD.from,
        publishedTo: PERIOD.to,
      }),
    ]);
    expect(report.scope).toEqual({
      brandId: 'brand-1',
      credentialId: 'cred-1',
      handle: 'genfeedai',
      organizationId: 'org-1',
    });
    expect(report.growth).toMatchObject({
      reason: 'no_snapshots',
      state: 'insufficient',
    });
  });

  it('refuses an account of another brand or organization', async () => {
    const { service } = setup({
      credentials: [
        {
          brandId: 'brand-2',
          externalHandle: 'other',
          id: 'cred-2',
          organizationId: 'org-1',
        },
        {
          brandId: 'brand-1',
          externalHandle: 'theirs',
          id: 'cred-3',
          organizationId: 'org-2',
        },
      ],
    });

    await expect(
      service.build(SCOPE, { credentialId: 'cred-2', period: PERIOD }, NOW),
    ).rejects.toThrow(/not found/);
    await expect(
      service.build(SCOPE, { credentialId: 'cred-3', period: PERIOD }, NOW),
    ).rejects.toThrow(/not found/);
  });

  it('reads at most two pages and says when it left publications out', async () => {
    const { queries, service } = setup({
      pages: [
        { docs: [], hasNextPage: true },
        { docs: [], hasNextPage: true },
      ],
    });

    const report = await service.build(
      SCOPE,
      { credentialId: 'cred-1', period: PERIOD },
      NOW,
    );

    expect(queries.map((query) => query.page)).toEqual([1, 2]);
    expect(report.activity.isTruncated).toBe(true);
  });

  it.each([
    ['an inverted period', { from: PERIOD.to, to: PERIOD.from }],
    [
      'a period in the future',
      { from: '2026-11-01T00:00:00.000Z', to: '2026-11-05T00:00:00.000Z' },
    ],
    [
      'a period over 92 days',
      { from: '2026-06-01T00:00:00.000Z', to: '2026-10-01T00:00:00.000Z' },
    ],
    ['a period that is not a date', { from: 'soon', to: PERIOD.to }],
  ])('refuses %s', async (_name, period) => {
    const { service } = setup({});

    await expect(
      service.build(SCOPE, { credentialId: 'cred-1', period }, NOW),
    ).rejects.toThrow();
  });

  it('adds quote and approval facts from the post, within the same organization and brand', async () => {
    const { service } = setup({
      pages: [
        {
          docs: [
            {
              id: 'p1',
              publicationKind: 'post',
              urlKind: 'permalink',
              url: 'https://x.com/genfeedai/status/1',
              externalId: '1',
            },
            {
              id: 'p2',
              publicationKind: 'post',
              urlKind: 'permalink',
              url: 'https://x.com/genfeedai/status/2',
              externalId: '2',
            },
          ],
          hasNextPage: false,
        },
      ],
      posts: [
        {
          brandId: 'brand-1',
          id: 'p1',
          organizationId: 'org-1',
          publishApproval: {
            executedAt: new Date('2026-10-03T10:00:05.000Z'),
            status: 'executed',
          },
          quoteTweetId: 'q-9',
          reviewDecision: 'APPROVED',
          reviewedAt: new Date('2026-10-03T09:00:00.000Z'),
        },
        {
          brandId: 'brand-9',
          id: 'p2',
          organizationId: 'org-1',
          publishApproval: null,
          quoteTweetId: 'q-8',
          reviewDecision: 'APPROVED',
          reviewedAt: null,
        },
      ],
    });

    const report = await service.build(
      SCOPE,
      { credentialId: 'cred-1', period: PERIOD },
      NOW,
    );

    expect(report.activity.rows.map((row) => row.kind)).toEqual([
      'quote',
      'post',
    ]);
    expect(report.activity.rows[0].approval).toMatchObject({
      decision: 'APPROVED',
      publishApprovalStatus: 'executed',
      reviewedAt: '2026-10-03T09:00:00.000Z',
    });
    // The other brand's post row is never read, so p2 carries no facts.
    expect(report.activity.rows[1].approval).toBeNull();
  });
});
