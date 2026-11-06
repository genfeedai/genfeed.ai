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

  function dailyRow(overrides: Record<string, unknown> = {}): MemoryRow {
    return {
      brandId: 'brand-1',
      date: new Date(),
      entries: [],
      id: 'memory-1',
      insights: [],
      isDeleted: false,
      metrics: {},
      organizationId: 'org-1',
      updatedAt: new Date('2026-09-01T00:00:00.000Z'),
      ...overrides,
    };
  }

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

    const brandMemory = {
      create: async (args: { data: Record<string, unknown> }) => {
        guard('create', args);
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

      expect(listed.map((row) => row.id)).toEqual([
        'memory-new',
        'memory-old',
      ]);
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

      expect(rows[0]?.insights).toEqual([
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

      expect(rows[0]?.insights).toEqual([
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

      expect(rows[0]?.entries).toEqual([
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
        entries: [expect.objectContaining({ content: 'Fresh note' })],
        organizationId: 'org-1',
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
          entries: [expect.objectContaining({ content: 'note' })],
          metrics: { postsPublished: 3, totalEngagement: 10 },
        }),
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
      expect(rows[0]?.entries).toEqual([]);
    });
  });
});
