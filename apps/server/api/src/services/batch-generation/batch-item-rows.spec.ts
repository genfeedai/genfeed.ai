import {
  persistBatchItemRows,
  toBatchItemCreatedAt,
  toPrismaBatchItemStatus,
} from '@api/services/batch-generation/batch-item-rows';
import {
  BatchItemStatus,
  ContentFormat,
  PersistedReviewDecision,
  ReviewDecision,
} from '@genfeedai/enums';
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
});
