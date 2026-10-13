import { isGenfeedDefaultKitDraft } from '@genfeedai/helpers';
import type { PrismaClient } from '@genfeedai/prisma';
import { describe, expect, it, vi } from 'vitest';
import {
  type BrandDefaultKitBackfillRow,
  backfillBrandDefaultKit,
  buildBrandDefaultKitContent,
  parseBrandDefaultKitBackfillArgs,
} from './backfill-brand-default-kit';

const rows: BrandDefaultKitBackfillRow[] = [
  { description: null, id: 'brand-1', label: 'Acme', organizationId: 'org-1' },
  {
    description: 'Anvils',
    id: 'brand-2',
    label: 'Beta',
    organizationId: 'org-2',
  },
];

function fakePrisma(options: { concurrentIds?: string[] } = {}) {
  const created: Array<{ brandId: string; version: number }> = [];
  const tx = {
    $queryRaw: vi.fn().mockResolvedValue([]),
    brand: {
      update: vi.fn().mockResolvedValue({ brandOsRevisionVersion: 1 }),
    },
    brandOsRevision: {
      count: vi.fn(async ({ where }: { where: { brandId: string } }) =>
        options.concurrentIds?.includes(where.brandId) ? 1 : 0,
      ),
      create: vi.fn(
        async ({ data }: { data: { brandId: string; version: number } }) => {
          created.push(data);
          return data;
        },
      ),
    },
  };
  let served = false;
  const prisma = {
    $queryRaw: vi.fn(async () => {
      if (served) return [];
      served = true;
      return rows;
    }),
    $transaction: vi.fn(async (callback: (client: typeof tx) => unknown) =>
      callback(tx),
    ),
  };
  return { created, prisma: prisma as unknown as PrismaClient, tx };
}

describe('brand default kit backfill', () => {
  it('defaults to a dry run and reads the batch size', () => {
    expect(parseBrandDefaultKitBackfillArgs([])).toEqual({
      batchSize: 100,
      dryRun: true,
    });
    expect(parseBrandDefaultKitBackfillArgs(['--live', '--batch=7'])).toEqual({
      batchSize: 7,
      dryRun: false,
    });
  });

  it('builds scoped default-kit content for a brand', () => {
    const content = buildBrandDefaultKitContent(rows[1]);
    expect(isGenfeedDefaultKitDraft(content)).toBe(true);
    expect(content).toMatchObject({
      brandId: 'brand-2',
      id: 'brand-2',
      organizationId: 'org-2',
    });
    expect(content.fields.description?.currentValue).toBe('Anvils');
  });

  it('reports brands without a revision and changes nothing in dry-run', async () => {
    const { created, prisma } = fakePrisma();
    const counts = await backfillBrandDefaultKit(prisma, {
      batchSize: 10,
      dryRun: true,
    });
    expect(counts).toEqual({
      brandsScanned: 2,
      brandsSeeded: 0,
      brandsSkippedConcurrent: 0,
    });
    expect(created).toHaveLength(0);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('seeds each brand once under its lock in live mode', async () => {
    const { created, prisma, tx } = fakePrisma();
    const counts = await backfillBrandDefaultKit(prisma, {
      batchSize: 10,
      dryRun: false,
    });
    expect(counts).toEqual({
      brandsScanned: 2,
      brandsSeeded: 2,
      brandsSkippedConcurrent: 0,
    });
    expect(created.map((item) => item.brandId)).toEqual(['brand-1', 'brand-2']);
    expect(tx.$queryRaw).toHaveBeenCalledTimes(2);
  });

  it('skips a brand that gained a revision before its write', async () => {
    const { created, prisma } = fakePrisma({ concurrentIds: ['brand-1'] });
    const counts = await backfillBrandDefaultKit(prisma, {
      batchSize: 10,
      dryRun: false,
    });
    expect(counts.brandsSkippedConcurrent).toBe(1);
    expect(counts.brandsSeeded).toBe(1);
    expect(created.map((item) => item.brandId)).toEqual(['brand-2']);
  });
});
