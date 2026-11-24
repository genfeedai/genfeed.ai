import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@genfeedai/prisma', async () => {
  const { canonicalPrismaMock } = await import(
    '@api/shared/testing/prisma-mock'
  );
  return canonicalPrismaMock();
});

import { BrandMemoryService } from '@api/collections/brand-memory/services/brand-memory.service';
import type { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import type { LoggerService } from '@libs/logger/logger.service';
import { runWithTenantContext } from '@libs/prisma/tenant-context';
import { assertTenantScopedQuery } from '@libs/prisma/tenant-guard';

type MemoryRow = Record<string, unknown> & {
  id: string;
  updatedAt: Date;
};

type Where = Record<string, unknown>;

function matchesField(value: unknown, filter: unknown): boolean {
  if (filter && typeof filter === 'object' && !(filter instanceof Date)) {
    const range = filter as {
      gte?: Date;
      lt?: Date;
      startsWith?: string;
    };
    if (range.startsWith !== undefined) {
      return typeof value === 'string' && value.startsWith(range.startsWith);
    }
    const time = value instanceof Date ? value.getTime() : Number.NaN;
    return (
      (range.gte === undefined || time >= range.gte.getTime()) &&
      (range.lt === undefined || time < range.lt.getTime())
    );
  }
  return value === filter;
}

const matchesWhere = (row: MemoryRow, where: Where) =>
  Object.entries(where).every(([key, filter]) =>
    matchesField(row[key], filter),
  );

describe('BrandMemoryService', () => {
  let rows: MemoryRow[];
  let service: BrandMemoryService;

  function dailyRow(
    overrides: Record<string, unknown> & {
      entries?: unknown[];
      insights?: unknown[];
      metrics?: Record<string, unknown>;
    } = {},
  ): MemoryRow {
    const { entries, insights, metrics, ...columns } = overrides;
    return {
      brandId: 'brand-1',
      date: new Date(),
      id: 'memory-1',
      isDeleted: false,
      metadata: {
        entries: entries ?? [],
        insights: insights ?? [],
        metrics: metrics ?? {},
      },
      organizationId: 'org-1',
      type: 'daily',
      updatedAt: new Date('2026-09-01T00:00:00.000Z'),
      ...columns,
    };
  }

  const body = (row: MemoryRow | undefined) =>
    row?.metadata as {
      entries: unknown[];
      insights: unknown[];
      metrics: Record<string, unknown>;
    };

  beforeEach(() => {
    rows = [];
    let sequence = 0;

    // Every query runs through the real CLOUD tenant guard, so an unscoped
    // or cross-tenant query throws here the way it does in production.
    const guard = (operation: string, args: unknown) =>
      assertTenantScopedQuery({
        args,
        isCloud: true,
        model: 'BrandMemory',
        operation,
        tenantModelNames: new Set(['BrandMemory']),
      });
    const newest = (where: Where) =>
      rows
        .filter((row) => matchesWhere(row, where))
        .sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime());

    // The columns of the real `brand_memories` table. Prisma rejects any other
    // field, so the fake must too, or a write to a column the table lacks
    // (`entries`, `insights`, `metrics`) passes here and fails in production.
    const COLUMNS = new Set([
      'brandId',
      'content',
      'date',
      'id',
      'isDeleted',
      'metadata',
      'organizationId',
      'type',
    ]);
    const assertKnownColumns = (data: Record<string, unknown>) => {
      const unknown = Object.keys(data).filter((key) => !COLUMNS.has(key));
      if (unknown.length > 0) {
        throw new Error(
          `Unknown argument \`${unknown[0]}\`: BrandMemory has no such field`,
        );
      }
    };

    const brandMemory = {
      create: async (args: { data: Record<string, unknown> }) => {
        guard('create', args);
        assertKnownColumns(args.data);
        sequence += 1;
        const row = {
          ...args.data,
          id: `memory-created-${sequence}`,
          updatedAt: new Date(Date.UTC(2026, 9, sequence)),
        } as MemoryRow;
        rows.push(row);
        return row;
      },
      findFirst: async (args: { where: Where }) => {
        guard('findFirst', args);
        return newest(args.where)[0] ?? null;
      },
      findMany: async (args: { where: Where }) => {
        guard('findMany', args);
        return newest(args.where);
      },
      update: async (args: { data: Record<string, unknown>; where: Where }) => {
        guard('update', args);
        assertKnownColumns(args.data);
        const row = rows.find((candidate) =>
          matchesWhere(candidate, args.where),
        );
        if (!row) {
          throw new Error('Record to update not found');
        }
        Object.assign(row, args.data);
        return row;
      },
    };
    const logger = {
      debug: () => {},
      error: () => {},
      log: () => {},
      warn: () => {},
    };

    service = new BrandMemoryService(
      { brandMemory } as unknown as PrismaService,
      logger as unknown as LoggerService,
    );
  });

  describe('typed entries', () => {
    it('creates a typed row scoped to the organization and brand', async () => {
      await service.upsertTypedEntry('org-1', 'brand-1', {
        content: 'I ran finance at a startup.',
        metadata: { fieldKey: 'originStory' },
        type: 'positioning.originStory',
      });

      expect(rows).toEqual([
        expect.objectContaining({
          brandId: 'brand-1',
          content: 'I ran finance at a startup.',
          isDeleted: false,
          metadata: { fieldKey: 'originStory' },
          organizationId: 'org-1',
          type: 'positioning.originStory',
        }),
      ]);
    });

    it('overwrites the same typed row when the answer changes', async () => {
      await service.upsertTypedEntry('org-1', 'brand-1', {
        content: 'First version',
        type: 'positioning.originStory',
      });
      await service.upsertTypedEntry('org-1', 'brand-1', {
        content: 'Second version',
        type: 'positioning.originStory',
      });

      expect(rows).toEqual([
        expect.objectContaining({
          content: 'Second version',
          id: 'memory-created-1',
        }),
      ]);
    });

    it('keeps typed rows of another organization separate', async () => {
      rows = [
        dailyRow({
          content: 'Foreign answer',
          id: 'memory-foreign',
          organizationId: 'org-2',
          type: 'positioning.originStory',
        }),
      ];

      await service.upsertTypedEntry('org-1', 'brand-1', {
        content: 'Own answer',
        type: 'positioning.originStory',
      });

      expect(rows.map((row) => [row.id, row.content])).toEqual([
        ['memory-foreign', 'Foreign answer'],
        ['memory-created-1', 'Own answer'],
      ]);
    });

    it('lists live typed rows by prefix, newest first', async () => {
      rows = [
        dailyRow({
          id: 'memory-old',
          type: 'positioning.audience',
          updatedAt: new Date('2026-09-01T00:00:00.000Z'),
        }),
        dailyRow({
          id: 'memory-new',
          type: 'positioning.originStory',
          updatedAt: new Date('2026-09-02T00:00:00.000Z'),
        }),
        dailyRow({ id: 'memory-voice', type: 'voice.tone' }),
        dailyRow({
          id: 'memory-deleted',
          isDeleted: true,
          type: 'positioning.offer',
        }),
        dailyRow({
          id: 'memory-foreign',
          organizationId: 'org-2',
          type: 'positioning.offer',
        }),
      ];

      const listed = await service.listTypedEntries(
        'org-1',
        'brand-1',
        'positioning.',
      );

      expect(listed.map((row) => row.id)).toEqual(['memory-new', 'memory-old']);
    });
  });

  describe('daily row', () => {
    it('replaces a replayed analytics insight while preserving other insights', async () => {
      const source = 'analytics-threshold:engagementRate:2026-09-24';
      rows = [
        dailyRow({
          insights: [
            { insight: 'Keep my voice', source: 'preference' },
            { insight: 'Old measurement', source },
          ],
        }),
      ];

      await service.addInsight('org-1', 'brand-1', {
        category: 'performance',
        confidence: 0.8,
        insight: 'Updated measurement',
        source,
      });

      expect(body(rows[0]).insights).toEqual([
        { insight: 'Keep my voice', source: 'preference' },
        expect.objectContaining({ insight: 'Updated measurement', source }),
      ]);
    });

    it('replaces a replayed winner insight but appends unkeyed insights', async () => {
      const source = 'analytics-winner:post-1';
      rows = [
        dailyRow({
          insights: [
            { insight: 'Distilled', source: 'memory_distiller_30d' },
            { insight: 'Earlier winner', source },
          ],
        }),
      ];

      await service.addInsight('org-1', 'brand-1', {
        category: 'performance',
        confidence: 0.5,
        insight: 'Updated winner',
        source,
      });
      await service.addInsight('org-1', 'brand-1', {
        category: 'format',
        confidence: 0.5,
        insight: 'Distilled again',
        source: 'memory_distiller_30d',
      });

      expect(body(rows[0]).insights).toEqual([
        { insight: 'Distilled', source: 'memory_distiller_30d' },
        expect.objectContaining({ insight: 'Updated winner', source }),
        expect.objectContaining({
          insight: 'Distilled again',
          source: 'memory_distiller_30d',
        }),
      ]);
    });

    it('replaces a keyed log entry on replay and appends unkeyed entries', async () => {
      rows = [
        dailyRow({
          entries: [
            { content: 'Manual note', type: 'note' },
            { content: 'Old', key: 'post_performance:post-1', type: 'p' },
          ],
        }),
      ];

      await service.logEntry('org-1', 'brand-1', {
        content: 'New',
        key: 'post_performance:post-1',
        type: 'p',
      });
      await service.logEntry('org-1', 'brand-1', {
        content: 'Another note',
        type: 'note',
      });

      expect(body(rows[0]).entries).toEqual([
        { content: 'Manual note', type: 'note' },
        expect.objectContaining({
          content: 'New',
          key: 'post_performance:post-1',
        }),
        expect.objectContaining({ content: 'Another note', type: 'note' }),
      ]);
    });

    it('starts a new daily row when the existing one is from an earlier day', async () => {
      rows = [dailyRow({ date: new Date('2020-01-01T12:00:00.000Z') })];

      await service.logEntry('org-1', 'brand-1', {
        content: 'Fresh note',
        type: 'note',
      });

      expect(rows).toHaveLength(2);
      expect(rows[1]).toMatchObject({
        metadata: {
          entries: [expect.objectContaining({ content: 'Fresh note' })],
        },
        organizationId: 'org-1',
        type: 'daily',
      });
    });

    it('scopes the daily-row reads and writes to the organization in CLOUD mode', async () => {
      rows = [dailyRow({ metrics: { totalEngagement: 10 } })];

      await runWithTenantContext({ organizationId: 'org-1' }, async () => {
        await service.logEntry('org-1', 'brand-1', {
          content: 'note',
          type: 'note',
        });
        await service.updateMetrics('org-1', 'brand-1', {
          postsPublished: 3,
        });
      });

      expect(rows).toEqual([
        expect.objectContaining({
          metadata: expect.objectContaining({
            entries: [expect.objectContaining({ content: 'note' })],
            metrics: { postsPublished: 3, totalEngagement: 10 },
          }),
        }),
      ]);
    });

    it('creates the day row on the columns the table has, with the day in metadata', async () => {
      const document = await service.logEntry('org-1', 'brand-1', {
        content:
          'Post post-1 on YOUTUBE reached 2 engagements with 50.00% engagement rate.',
        key: 'post_performance:post-1',
        metadata: { contentType: 'video', engagementRate: 50 },
        type: 'post_performance',
      });

      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({
        brandId: 'brand-1',
        isDeleted: false,
        organizationId: 'org-1',
        type: 'daily',
      });
      expect(rows[0]).not.toHaveProperty('entries');
      expect(document?.entries).toEqual([
        expect.objectContaining({ key: 'post_performance:post-1' }),
      ]);
    });

    it('does not write the day into a typed row that shares today', async () => {
      await service.upsertTypedEntry('org-1', 'brand-1', {
        content: 'I ran finance at a startup.',
        type: 'positioning.originStory',
      });

      await service.logEntry('org-1', 'brand-1', {
        content: 'note',
        type: 'note',
      });

      expect(rows).toHaveLength(2);
      expect(rows[0]).toMatchObject({
        content: 'I ran finance at a startup.',
        type: 'positioning.originStory',
      });
      expect(rows[0]?.metadata).toBeUndefined();
    });

    it('reads the day rows back as documents and leaves typed rows out', async () => {
      rows = [
        dailyRow({
          insights: [
            {
              createdAt: '2026-09-01T00:00:00.000Z',
              insight: 'Old',
              source: 'a',
            },
            {
              createdAt: '2026-09-02T00:00:00.000Z',
              insight: 'New',
              source: 'b',
            },
          ],
          metrics: { topPerformingFormat: 'video' },
        }),
      ];
      await service.upsertTypedEntry('org-1', 'brand-1', {
        content: 'typed',
        type: 'positioning.originStory',
      });

      const memory = await service.getMemory('org-1', 'brand-1');
      const insights = await service.getInsights('org-1', 'brand-1');

      expect(memory).toHaveLength(1);
      expect(memory[0]).toMatchObject({
        insights: expect.any(Array),
        metrics: { topPerformingFormat: 'video' },
      });
      expect(insights.map((insight) => insight.insight)).toEqual([
        'New',
        'Old',
      ]);
    });

    it('fails a daily-row write for another organization than the tenant context', async () => {
      rows = [dailyRow()];

      await expect(
        runWithTenantContext({ organizationId: 'org-2' }, () =>
          service.logEntry('org-1', 'brand-1', {
            content: 'note',
            type: 'note',
          }),
        ),
      ).rejects.toThrow();
      expect(body(rows[0]).entries).toEqual([]);
    });
  });
});
