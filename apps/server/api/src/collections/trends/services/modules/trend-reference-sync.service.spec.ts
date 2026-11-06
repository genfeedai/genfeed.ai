import { TrendReferenceSyncService } from '@api/collections/trends/services/modules/trend-reference-sync.service';
import type { SyncTrendReferenceInput } from '@api/collections/trends/services/trend-reference-corpus.types';
import type { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import type { LoggerService } from '@libs/logger/logger.service';

interface Row {
  [key: string]: unknown;
}

function sameValue(left: unknown, right: unknown): boolean {
  if (left instanceof Date && right instanceof Date) {
    return left.getTime() === right.getTime();
  }
  return left === right;
}

function createTable(prefix: string, state: { failCreate: Error | null }) {
  const rows: Row[] = [];
  const matches = (row: Row, where: Row): boolean =>
    Object.entries(where).every(([key, value]) => sameValue(row[key], value));
  return {
    create: async ({ data }: { data: Row }) => {
      if (state.failCreate) {
        throw state.failCreate;
      }
      const row = { ...data, id: `${prefix}_${rows.length + 1}` };
      rows.push(row);
      return row;
    },
    findFirst: async ({ where }: { where: Row }) =>
      rows.find((row) => matches(row, where)) ?? null,
    rows,
    update: async ({ data, where }: { data: Row; where: { id: string } }) => {
      const row = rows.find((candidate) => candidate.id === where.id);
      Object.assign(row ?? {}, data);
      return row;
    },
  };
}

/** In-memory stand-in for the three trend reference tables. */
function createFakePrisma() {
  const referenceState = { failCreate: null as Error | null };
  const otherState = { failCreate: null as Error | null };
  return {
    referenceState,
    trendSourceReference: createTable('reference', referenceState),
    trendSourceReferenceLink: createTable('link', otherState),
    trendSourceReferenceSnapshot: createTable('snapshot', otherState),
  };
}

function trend(sourceUrl: string): SyncTrendReferenceInput {
  return {
    id: 'trend_1',
    mentions: 12,
    platform: 'tiktok',
    sourcePreview: [
      {
        contentType: 'video',
        id: 'source_1',
        metrics: { likes: 4, shares: 2, views: 20 },
        platform: 'tiktok',
        sourceUrl,
      },
    ],
    sourcePreviewState: 'live',
    topic: 'ai tools',
    viralityScore: 80,
  };
}

describe('TrendReferenceSyncService', () => {
  let prisma: ReturnType<typeof createFakePrisma>;
  let service: TrendReferenceSyncService;

  beforeEach(() => {
    prisma = createFakePrisma();
    service = new TrendReferenceSyncService(
      prisma as unknown as PrismaService,
      { warn: () => undefined } as unknown as LoggerService,
    );
  });

  it('persists the canonical reference with its engagement total, snapshot and link', async () => {
    const result = await service.syncTrendReferences([
      trend('https://example.com/reference?utm_source=test'),
    ]);

    expect(result).toEqual({ links: 1, references: 1, snapshots: 1 });
    expect(prisma.trendSourceReference.rows).toEqual([
      expect.objectContaining({
        canonicalUrl: 'https://example.com/reference',
        currentEngagementTotal: 26,
        id: 'reference_1',
        isDeleted: false,
        platform: 'tiktok',
      }),
    ]);
    expect(prisma.trendSourceReferenceSnapshot.rows).toEqual([
      expect.objectContaining({ sourceReferenceId: 'reference_1' }),
    ]);
    expect(prisma.trendSourceReferenceLink.rows).toEqual([
      expect.objectContaining({
        sourceReferenceId: 'reference_1',
        trendId: 'trend_1',
      }),
    ]);
  });

  it('reuses the reference, daily snapshot and link when the same source is synced again', async () => {
    await service.syncTrendReferences([trend('https://example.com/reference')]);

    const second = await service.syncTrendReferences([
      trend('https://example.com/reference?utm_source=again'),
    ]);

    expect(second).toEqual({ links: 0, references: 1, snapshots: 0 });
    expect(prisma.trendSourceReference.rows).toHaveLength(1);
    expect(prisma.trendSourceReferenceSnapshot.rows).toHaveLength(1);
    expect(prisma.trendSourceReferenceLink.rows).toHaveLength(1);
  });

  it('propagates persistence failures instead of reporting partial success', async () => {
    prisma.referenceState.failCreate = new Error('database unavailable');

    await expect(
      service.syncTrendReferences([trend('https://example.com/reference')]),
    ).rejects.toThrow('database unavailable');
    expect(prisma.trendSourceReferenceSnapshot.rows).toEqual([]);
    expect(prisma.trendSourceReferenceLink.rows).toEqual([]);
  });
});
