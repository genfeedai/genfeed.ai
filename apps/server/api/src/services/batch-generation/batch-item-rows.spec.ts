import { BATCH_ITEM_UPSERT_CHUNK_SIZE } from '@api/services/batch-generation/batch-generation.constants';
import {
  persistBatchItemRows,
  toBatchItemCreatedAt,
  toPrismaBatchItemStatus,
  writeBatchJsonAndItemRows,
} from '@api/services/batch-generation/batch-item-rows';
import {
  BatchItemStatus,
  BatchStatus,
  ContentFormat,
  PersistedReviewDecision,
  ReviewDecision,
} from '@genfeedai/contracts';
import { describe, expect, it, vi } from 'vitest';

describe('batch item row projection', () => {
  it('maps known statuses and falls back to PENDING', () => {
    expect(toPrismaBatchItemStatus(BatchItemStatus.COMPLETED)).toBe(
      BatchItemStatus.COMPLETED,
    );
    expect(toPrismaBatchItemStatus('skipped')).toBe(BatchItemStatus.SKIPPED);
    expect(toPrismaBatchItemStatus('not-a-status')).toBe(
      BatchItemStatus.PENDING,
    );
  });

  it('parses createdAt and falls back when the value is unusable', () => {
    const fallback = new Date('2026-08-12T00:00:00.000Z');
    expect(
      toBatchItemCreatedAt('2026-08-11T10:00:00.000Z', fallback).toISOString(),
    ).toBe('2026-08-11T10:00:00.000Z');
    expect(toBatchItemCreatedAt('not-a-date', fallback)).toBe(fallback);
    expect(toBatchItemCreatedAt(undefined, fallback)).toBe(fallback);
  });

  it('upserts one typed row per JSON item with UNSET stored as null', async () => {
    const upsert = vi.fn().mockResolvedValue({});

    await persistBatchItemRows(
      { batchItem: { upsert } },
      {
        batchId: 'batch-1',
        brandId: 'brand-1',
        items: [
          {
            createdAt: '2026-08-12T11:00:00.000Z',
            format: ContentFormat.IMAGE,
            id: 'item-ready',
            reviewDecision: ReviewDecision.UNSET,
            status: BatchItemStatus.COMPLETED,
          },
          {
            format: ContentFormat.REEL,
            id: 'item-approved',
            reviewDecision: ReviewDecision.APPROVED,
            status: BatchItemStatus.COMPLETED,
          },
        ],
        organizationId: 'org-1',
      },
    );

    expect(upsert).toHaveBeenCalledTimes(2);
    expect(upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          batchId: 'batch-1',
          brandId: 'brand-1',
          id: 'item-ready',
          organizationId: 'org-1',
          reviewDecision: null,
          status: BatchItemStatus.COMPLETED,
        }),
        update: expect.objectContaining({
          reviewDecision: null,
          status: BatchItemStatus.COMPLETED,
        }),
        where: {
          id: 'item-ready',
          organizationId: 'org-1',
        },
      }),
    );
    expect(upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          assigneeId: null,
          id: 'item-approved',
          reviewDecision: PersistedReviewDecision.APPROVED,
        }),
        where: {
          id: 'item-approved',
          organizationId: 'org-1',
        },
      }),
    );
  });

  it('persists assigneeId and strips nested assignee identity from JSON', async () => {
    const upsert = vi.fn().mockResolvedValue({});

    await persistBatchItemRows(
      { batchItem: { upsert } },
      {
        batchId: 'batch-1',
        items: [
          {
            assignee: {
              displayName: 'Jane Doe',
              email: 'secret@example.com',
              handle: 'jane',
              id: 'user-1',
            },
            assigneeId: 'user-1',
            format: ContentFormat.IMAGE,
            id: 'item-assigned',
            reviewDecision: ReviewDecision.UNSET,
            status: BatchItemStatus.COMPLETED,
          } as never,
        ],
        organizationId: 'org-1',
      },
    );

    expect(upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          assigneeId: 'user-1',
          data: expect.objectContaining({
            assigneeId: 'user-1',
            id: 'item-assigned',
          }),
        }),
        update: expect.objectContaining({
          assigneeId: 'user-1',
        }),
      }),
    );
    const persistedData = upsert.mock.calls[0]?.[0]?.create?.data as Record<
      string,
      unknown
    >;
    expect(persistedData).not.toHaveProperty('assignee');
    expect(JSON.stringify(persistedData)).not.toContain('secret@example.com');
  });

  it('matches a soft-deleted row and restores it instead of creating', async () => {
    const existing = {
      id: 'item-tombstone',
      isDeleted: true,
      organizationId: 'org-1',
    };
    let created = false;
    let updated = false;

    const upsert = vi
      .fn()
      .mockImplementation(
        async (args: {
          create: { id: string; isDeleted: boolean; organizationId: string };
          update: { isDeleted: boolean };
          where: { id?: string; isDeleted?: boolean; organizationId?: string };
        }) => {
          const uniqueMatches =
            args.where.id === existing.id &&
            args.where.organizationId === existing.organizationId;
          const softDeleteFilterBlocks =
            args.where.isDeleted !== undefined &&
            args.where.isDeleted !== existing.isDeleted;

          if (uniqueMatches && !softDeleteFilterBlocks) {
            updated = true;
            return { ...existing, ...args.update };
          }

          if (uniqueMatches) {
            throw new Error('Unique constraint failed on the fields: (`id`)');
          }

          created = true;
          return args.create;
        },
      );

    await persistBatchItemRows(
      { batchItem: { upsert } },
      {
        batchId: 'batch-1',
        items: [
          {
            format: ContentFormat.IMAGE,
            id: 'item-tombstone',
            reviewDecision: ReviewDecision.UNSET,
            status: BatchItemStatus.PENDING,
          },
        ],
        organizationId: 'org-1',
      },
    );

    const call = upsert.mock.calls[0][0];
    expect(call.where).toEqual({
      id: 'item-tombstone',
      organizationId: 'org-1',
    });
    expect(call.where).not.toHaveProperty('isDeleted');
    expect(call.update.isDeleted).toBe(false);
    expect(call.create.isDeleted).toBe(false);
    expect(updated).toBe(true);
    expect(created).toBe(false);
  });

  it('upserts in bounded chunks instead of one unbounded Promise.all', async () => {
    let inFlight = 0;
    let maxInFlight = 0;
    const upsert = vi.fn().mockImplementation(async () => {
      inFlight += 1;
      maxInFlight = Math.max(maxInFlight, inFlight);
      await Promise.resolve();
      inFlight -= 1;
    });
    const itemCount = BATCH_ITEM_UPSERT_CHUNK_SIZE + 10;
    const items = Array.from({ length: itemCount }, (_, index) => ({
      format: ContentFormat.IMAGE,
      id: `item-${index}`,
      reviewDecision: ReviewDecision.UNSET,
      status: BatchItemStatus.PENDING,
    }));

    await persistBatchItemRows(
      { batchItem: { upsert } },
      {
        batchId: 'batch-1',
        items,
        organizationId: 'org-1',
      },
    );

    expect(upsert).toHaveBeenCalledTimes(itemCount);
    expect(maxInFlight).toBeLessThanOrEqual(BATCH_ITEM_UPSERT_CHUNK_SIZE);
  });

  it('writes Batch.items JSON and typed rows in one transaction', async () => {
    const order: string[] = [];
    const updateMany = vi.fn().mockImplementation(async () => {
      order.push('json');
      return { count: 1 };
    });
    const upsert = vi.fn().mockImplementation(async () => {
      order.push('row');
      return {};
    });
    const tx = { batch: { updateMany }, batchItem: { upsert } };
    const $transaction = vi.fn(
      async (run: (client: typeof tx) => Promise<unknown>) => run(tx),
    );
    const prisma = {
      $transaction,
      batch: { updateMany: vi.fn() },
      batchItem: { upsert: vi.fn() },
    };

    const items = [
      {
        format: ContentFormat.IMAGE,
        id: 'item-1',
        reviewDecision: ReviewDecision.UNSET,
        status: BatchItemStatus.COMPLETED,
      },
    ];

    const result = await writeBatchJsonAndItemRows(prisma, {
      batchId: 'batch-1',
      brandId: 'brand-1',
      extraBatchData: { status: BatchStatus.COMPLETED },
      items,
      organizationId: 'org-1',
    });

    expect($transaction).toHaveBeenCalledTimes(1);
    expect(result).toEqual({ count: 1 });
    expect(order).toEqual(['json', 'row']);
    expect(updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          items,
          status: BatchStatus.COMPLETED,
        }),
        where: expect.objectContaining({
          id: 'batch-1',
          isDeleted: false,
          organizationId: 'org-1',
        }),
      }),
    );
    expect(upsert).toHaveBeenCalledTimes(1);
  });

  it('skips typed-row upserts when the JSON batch write matches no row', async () => {
    const upsert = vi.fn();
    const result = await writeBatchJsonAndItemRows(
      {
        batch: { updateMany: vi.fn().mockResolvedValue({ count: 0 }) },
        batchItem: { upsert },
      },
      {
        batchId: 'batch-missing',
        items: [
          {
            format: ContentFormat.IMAGE,
            id: 'item-1',
            reviewDecision: ReviewDecision.UNSET,
            status: BatchItemStatus.PENDING,
          },
        ],
        organizationId: 'org-1',
      },
    );

    expect(result).toEqual({ count: 0 });
    expect(upsert).not.toHaveBeenCalled();
  });
});
