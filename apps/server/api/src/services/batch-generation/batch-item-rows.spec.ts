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
        where: { id: 'item-ready' },
      }),
    );
    expect(upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          id: 'item-approved',
          reviewDecision: PersistedReviewDecision.APPROVED,
        }),
        where: { id: 'item-approved' },
      }),
    );
  });
});
