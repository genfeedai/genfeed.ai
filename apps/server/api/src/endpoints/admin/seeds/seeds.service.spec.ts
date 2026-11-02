import { BadRequestException } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockSeedArticles, mockSeedWorkflows } = vi.hoisted(() => ({
  mockSeedArticles: vi.fn(),
  mockSeedWorkflows: vi.fn(),
}));

vi.mock('@api-scripts/seeds/articles.seed', () => ({
  seedArticles: mockSeedArticles,
}));
vi.mock('@api-scripts/seeds/workflows.seed', () => ({
  seedWorkflows: mockSeedWorkflows,
}));

const { AdminSeedsService } = await import('./seeds.service');

interface FakeOrganization {
  accountType: string | null;
  category: string;
  email: string | null;
  id: string;
  isDeleted?: boolean;
}

/** In-memory stand-in for the organization table, honouring the seed's filters. */
function buildOrganizations(rows: FakeOrganization[]) {
  const table = rows.map((row) => ({ isDeleted: false, ...row }));
  const prisma = {
    organization: {
      findMany: async (args: { where: { id: { notIn: string[] } } }) =>
        table
          .filter(
            (row) =>
              !row.isDeleted &&
              !args.where.id.notIn.includes(row.id) &&
              (row.accountType ?? row.category) === 'BUSINESS',
          )
          .map((row) => ({
            accountType: row.accountType,
            id: row.id,
            user: row.email === null ? null : { email: row.email },
          })),
      update: async (args: {
        data: { accountType?: string; category: string };
        where: { id: string };
      }) => {
        const row = table.find((candidate) => candidate.id === args.where.id);
        if (row) {
          row.category = args.data.category;
          row.accountType = args.data.accountType ?? row.accountType;
        }
        return row;
      },
    },
  };
  return {
    service: new AdminSeedsService(prisma as never, {} as never, {} as never),
    table,
  };
}

function build() {
  const prisma = {} as never;
  const cache = { invalidateByTags: vi.fn().mockResolvedValue(2) };
  const platformTemplates = {
    reconcileCatalog: vi.fn().mockResolvedValue({
      keys: ['content.video.default'],
      unchanged: 3,
      written: 1,
    }),
  };
  return {
    cache,
    platformTemplates,
    prisma,
    service: new AdminSeedsService(
      prisma,
      cache as never,
      platformTemplates as never,
    ),
  };
}

describe('AdminSeedsService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSeedArticles.mockResolvedValue({
      created: 3,
      dryRun: true,
      owner: { brandId: 'brand-1', organizationId: 'org-1' },
      refreshed: 1,
    });
    mockSeedWorkflows.mockResolvedValue({
      dryRun: true,
      skipped: 0,
      unchanged: 4,
      updated: 2,
    });
  });

  describe('seedArticles', () => {
    it('defaults to a dry run and needs no owner for it', async () => {
      const { prisma, service } = build();

      await expect(service.seedArticles({})).resolves.toEqual({
        brandId: 'brand-1',
        created: 3,
        dryRun: true,
        organizationId: 'org-1',
        refreshed: 1,
      });

      expect(mockSeedArticles).toHaveBeenCalledWith(
        prisma,
        expect.objectContaining({ dryRun: true }),
        expect.any(Object),
      );
    });

    it('refuses a live run that does not name its owner', async () => {
      const { service } = build();

      await expect(
        service.seedArticles({ brandSlug: 'genfeed', dryRun: false }),
      ).rejects.toThrow('must name its owner');
      expect(mockSeedArticles).not.toHaveBeenCalled();
    });

    it('refuses a live run that does not name its review brand', async () => {
      const { service } = build();

      await expect(
        service.seedArticles({ dryRun: false, ownerEmail: 'a@b.co' }),
      ).rejects.toThrow('must name its review brand');
      expect(mockSeedArticles).not.toHaveBeenCalled();
    });

    it('runs live for a named owner and brand and drops the public article cache', async () => {
      const { cache, service } = build();
      mockSeedArticles.mockImplementationOnce(
        async (
          _prisma: unknown,
          _options: unknown,
          hooks: { invalidateCache: () => Promise<void> },
        ) => {
          await hooks.invalidateCache();
          return {
            created: 1,
            dryRun: false,
            owner: { brandId: 'brand-1', organizationId: 'org-1' },
            refreshed: 0,
          };
        },
      );

      const result = await service.seedArticles({
        brandSlug: 'genfeed',
        dryRun: false,
        ownerEmail: 'owner@genfeed.ai',
      });

      expect(result.dryRun).toBe(false);
      expect(cache.invalidateByTags).toHaveBeenCalledWith([
        'articles',
        'public',
      ]);
    });

    it('reports a seed failure as a bad request', async () => {
      const { service } = build();
      mockSeedArticles.mockRejectedValueOnce(
        new Error('No active user found for email x'),
      );

      await expect(
        service.seedArticles({ ownerEmail: 'x@y.co' }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('seedWorkflows', () => {
    it('defaults to a dry run across every brand', async () => {
      const { service } = build();

      await expect(service.seedWorkflows({})).resolves.toMatchObject({
        dryRun: true,
        unchanged: 4,
        updated: 2,
      });
      expect(mockSeedWorkflows).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ dryRun: true }),
      );
    });

    it('refuses a live run that is not narrowed or explicitly global', async () => {
      const { service } = build();

      await expect(service.seedWorkflows({ dryRun: false })).rejects.toThrow(
        'allBrands',
      );
      expect(mockSeedWorkflows).not.toHaveBeenCalled();
    });

    it.each([
      { brandId: 'brand-1' },
      { organizationId: 'org-1' },
      { allBrands: true },
    ])('allows a live run with %o', async (scope) => {
      const { service } = build();

      await service.seedWorkflows({ dryRun: false, ...scope });

      expect(mockSeedWorkflows).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ dryRun: false }),
      );
    });
  });

  describe('seedTemplates', () => {
    it('defaults to a dry run', async () => {
      const { platformTemplates, service } = build();

      await expect(service.seedTemplates({})).resolves.toEqual({
        dryRun: true,
        keys: ['content.video.default'],
        unchanged: 3,
        written: 1,
      });
      expect(platformTemplates.reconcileCatalog).toHaveBeenCalledWith({
        isDryRun: true,
      });
    });

    it('writes only on an explicit live run', async () => {
      const { platformTemplates, service } = build();

      const summary = await service.seedTemplates({ dryRun: false });

      expect(summary.dryRun).toBe(false);
      expect(platformTemplates.reconcileCatalog).toHaveBeenCalledWith({
        isDryRun: false,
      });
    });

    it('turns a failed reconcile into a bad request', async () => {
      const { platformTemplates, service } = build();
      platformTemplates.reconcileCatalog.mockRejectedValue(
        new Error('Platform template reconcile failed for: a'),
      );

      await expect(service.seedTemplates({})).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  describe('seedOrganizationCategories', () => {
    const rows: FakeOrganization[] = [
      {
        accountType: null,
        category: 'BUSINESS',
        email: 'a@gmail.com',
        id: 'personal-legacy',
      },
      {
        accountType: 'BUSINESS',
        category: 'BUSINESS',
        email: 'b@yahoo.com',
        id: 'personal-typed',
      },
      {
        accountType: null,
        category: 'BUSINESS',
        email: 'c@acme.com',
        id: 'work',
      },
      {
        accountType: null,
        category: 'BUSINESS',
        email: null,
        id: 'no-owner-email',
      },
      {
        accountType: null,
        category: 'BUSINESS',
        email: 'd@gmail.com',
        id: 'excluded',
      },
      {
        accountType: 'AGENCY',
        category: 'BUSINESS',
        email: 'e@gmail.com',
        id: 'agency',
      },
      {
        accountType: null,
        category: 'CREATOR',
        email: 'f@gmail.com',
        id: 'creator',
      },
      {
        accountType: null,
        category: 'BUSINESS',
        email: 'g@gmail.com',
        id: 'deleted',
        isDeleted: true,
      },
    ];

    it('lists the personal-email business orgs and writes nothing by default', async () => {
      const { service, table } = buildOrganizations(rows);

      await expect(
        service.seedOrganizationCategories({
          excludeOrganizationIds: ['excluded'],
        }),
      ).resolves.toEqual({
        dryRun: true,
        organizationIds: ['personal-legacy', 'personal-typed'],
      });
      expect(table.map((row) => row.category)).toEqual(
        rows.map((row) => row.category),
      );
    });

    it('moves only those orgs to CREATOR on a live run and is idempotent', async () => {
      const { service, table } = buildOrganizations(rows);
      const live = { dryRun: false, excludeOrganizationIds: ['excluded'] };

      await expect(service.seedOrganizationCategories(live)).resolves.toEqual({
        dryRun: false,
        organizationIds: ['personal-legacy', 'personal-typed'],
      });
      expect(
        Object.fromEntries(
          table.map((row) => [row.id, row.accountType ?? row.category]),
        ),
      ).toEqual({
        agency: 'AGENCY',
        creator: 'CREATOR',
        deleted: 'BUSINESS',
        excluded: 'BUSINESS',
        'no-owner-email': 'BUSINESS',
        'personal-legacy': 'CREATOR',
        'personal-typed': 'CREATOR',
        work: 'BUSINESS',
      });

      await expect(
        service.seedOrganizationCategories(live),
      ).resolves.toMatchObject({ organizationIds: [] });
    });
  });
});
