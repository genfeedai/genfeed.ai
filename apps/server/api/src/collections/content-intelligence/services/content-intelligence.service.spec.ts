import { ContentIntelligenceService } from '@api/collections/content-intelligence/services/content-intelligence.service';
import { NotFoundException } from '@api/exceptions/not-found.exception';
import type { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import {
  ContentIntelligencePlatform,
  CreatorAnalysisStatus,
} from '@genfeedai/contracts';
import type { LoggerService } from '@libs/logger/logger.service';
import { runWithTenantContext } from '@libs/prisma/tenant-context';
import {
  assertTenantScopedQuery,
  TenantIsolationError,
} from '@libs/prisma/tenant-guard';

const organizationId = '550e8400-e29b-41d4-a716-446655440001';
const otherOrganizationId = '550e8400-e29b-41d4-a716-446655440009';
const userId = '550e8400-e29b-41d4-a716-446655440002';

interface CreatorRow {
  createdAt: Date;
  createdById: string;
  data: Record<string, unknown>;
  id: string;
  isDeleted: boolean;
  organizationId: string;
  updatedAt: Date;
}

type Where = Record<string, unknown>;

/** Prisma `where` over scalar columns, `AND`, and JSON `{ path, equals }`. */
function matches(row: CreatorRow, where: Where): boolean {
  return Object.entries(where).every(([key, value]) => {
    if (key === 'AND') {
      return (value as Where[]).every((clause) => matches(row, clause));
    }
    if (key === 'data') {
      const { equals, path } = value as { equals: unknown; path: string[] };
      return row.data[path[0]] === equals;
    }
    return row[key as keyof CreatorRow] === value;
  });
}

/**
 * In-memory creator_analyses table. Every query passes through the CLOUD
 * tenant guard, so a query the guard would reject in production fails here.
 */
function setup(rows: CreatorRow[] = []) {
  const guard = (operation: string, args: unknown) =>
    assertTenantScopedQuery({
      args,
      isCloud: true,
      model: 'CreatorAnalysis',
      operation,
      tenantModelNames: new Set(['CreatorAnalysis']),
    });
  const creatorAnalysis = {
    create: async (args: {
      data: Pick<CreatorRow, 'createdById' | 'data' | 'organizationId'>;
    }) => {
      guard('create', args);
      const row: CreatorRow = {
        createdAt: new Date(),
        id: `creator-${rows.length + 1}`,
        isDeleted: false,
        updatedAt: new Date(),
        ...args.data,
      };
      rows.push(row);
      return { ...row };
    },
    findFirst: async (args: { where: Where }) => {
      guard('findFirst', args);
      const row = rows.find((item) => matches(item, args.where));
      return row ? { ...row } : null;
    },
    update: async (args: { data: Partial<CreatorRow>; where: Where }) => {
      guard('update', args);
      const row = rows.find((item) => matches(item, args.where));
      if (!row) throw new Error('Record to update not found.');
      Object.assign(row, args.data);
      return { ...row };
    },
  };
  const logger = {
    debug: () => undefined,
    error: () => undefined,
    log: () => undefined,
    warn: () => undefined,
  } as unknown as LoggerService;
  const service = new ContentIntelligenceService(
    { creatorAnalysis } as unknown as PrismaService,
    logger,
  );
  const inTenant = <T>(work: () => Promise<T>, tenant = organizationId) =>
    runWithTenantContext({ organizationId: tenant }, work);
  return { inTenant, rows, service };
}

const creator = (overrides: Partial<CreatorRow> = {}): CreatorRow => ({
  createdAt: new Date(),
  createdById: userId,
  data: {
    handle: '@creator',
    platform: ContentIntelligencePlatform.TWITTER,
    status: CreatorAnalysisStatus.PENDING,
  },
  id: 'creator-1',
  isDeleted: false,
  organizationId,
  updatedAt: new Date(),
  ...overrides,
});

describe('ContentIntelligenceService Prisma boundary', () => {
  it('stores creator domain fields in data and ownership in scalar columns', async () => {
    const { inTenant, rows, service } = setup();

    const result = await inTenant(() =>
      service.addCreator(organizationId, userId, {
        handle: '@creator',
        platform: ContentIntelligencePlatform.TWITTER,
      }),
    );

    expect(rows).toEqual([
      expect.objectContaining({
        createdById: userId,
        data: {
          handle: '@creator',
          platform: ContentIntelligencePlatform.TWITTER,
          scrapeConfig: {
            dateRangeDays: 90,
            includeReplies: false,
            maxPosts: 100,
          },
          status: CreatorAnalysisStatus.PENDING,
          tags: [],
        },
        organizationId,
      }),
    ]);
    expect(result).toMatchObject({ handle: '@creator', organizationId });
  });

  it('finds a creator by handle and platform within the organization', async () => {
    const { inTenant, service } = setup([
      creator({ id: 'creator-other-org', organizationId: otherOrganizationId }),
      creator({
        data: {
          handle: '@creator',
          platform: ContentIntelligencePlatform.TIKTOK,
        },
        id: 'creator-tiktok',
      }),
      creator({ id: 'creator-deleted', isDeleted: true }),
      creator({ id: 'creator-1' }),
    ]);

    const found = await inTenant(() =>
      service.findByHandle(
        organizationId,
        ContentIntelligencePlatform.TWITTER,
        '@creator',
      ),
    );

    expect(found).toMatchObject({ id: 'creator-1' });
  });

  it('returns the canonical 404 when updating a missing creator analysis', async () => {
    const { inTenant, service } = setup([
      creator({ id: 'creator-missing', organizationId: otherOrganizationId }),
    ]);

    const failure = await inTenant(() =>
      service.updateStatus(
        'creator-missing',
        organizationId,
        CreatorAnalysisStatus.FAILED,
      ),
    ).catch((error: unknown) => error);

    expect(failure).toBeInstanceOf(NotFoundException);
    expect((failure as NotFoundException).getStatus()).toBe(404);
    expect(failure).toMatchObject({ message: 'Creator analysis not found' });
  });

  it('updates status while keeping the rest of the creator data', async () => {
    const { inTenant, rows, service } = setup([creator()]);

    const result = await inTenant(() =>
      service.updateStatus(
        'creator-1',
        organizationId,
        CreatorAnalysisStatus.FAILED,
        'Profile is private',
      ),
    );

    expect(rows[0].data).toEqual({
      errorMessage: 'Profile is private',
      handle: '@creator',
      platform: ContentIntelligencePlatform.TWITTER,
      status: CreatorAnalysisStatus.FAILED,
    });
    expect(result).toMatchObject({
      organizationId,
      status: CreatorAnalysisStatus.FAILED,
    });
  });

  it('updates metrics and profile into the same creator data', async () => {
    const { inTenant, rows, service } = setup([creator()]);

    await inTenant(async () => {
      await service.updateMetrics('creator-1', organizationId, { x: 1 }, 5, 2);
      await service.updateCreatorProfile('creator-1', organizationId, {
        displayName: 'Creator',
      });
    });

    expect(rows[0].data).toMatchObject({
      displayName: 'Creator',
      handle: '@creator',
      metrics: { x: 1 },
      patternsExtracted: 2,
      postsScraped: 5,
    });
  });

  it('refuses to touch a creator outside the request tenant', async () => {
    const { inTenant, rows, service } = setup([creator()]);

    await expect(
      inTenant(
        () =>
          service.updateStatus(
            'creator-1',
            organizationId,
            CreatorAnalysisStatus.FAILED,
          ),
        'org-other',
      ),
    ).rejects.toBeInstanceOf(TenantIsolationError);
    expect(rows[0].data.status).toBe(CreatorAnalysisStatus.PENDING);
  });
});
