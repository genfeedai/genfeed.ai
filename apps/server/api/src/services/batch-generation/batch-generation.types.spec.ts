import { ReviewDecision } from '@genfeedai/contracts';
import { describe, expect, it } from 'vitest';
import {
  cloneBatchItems,
  resolveBatchItems,
  toBatchWithConfig,
} from './batch-generation.types';

describe('cloneBatchItems review decisions', () => {
  it('normalizes persisted aliases, missing values, events, and unknown values', () => {
    const items = cloneBatchItems([
      {
        id: 'approved',
        reviewDecision: 'APPROVED',
        reviewEvents: [{ decision: 'REQUEST_CHANGES' }],
      },
      { id: 'missing' },
      { id: 'unknown', reviewDecision: 'surprise' },
    ]);

    expect(items).toEqual([
      expect.objectContaining({
        id: 'approved',
        reviewDecision: ReviewDecision.APPROVED,
        reviewEvents: [
          expect.objectContaining({
            decision: ReviewDecision.REQUEST_CHANGES,
          }),
        ],
      }),
      expect.objectContaining({
        id: 'missing',
        reviewDecision: ReviewDecision.UNSET,
        reviewEvents: [],
      }),
      expect.objectContaining({
        id: 'unknown',
        reviewDecision: ReviewDecision.UNSET,
        reviewEvents: [],
      }),
    ]);
  });
});

describe('resolveBatchItems reader ratchet', () => {
  it('combines migrated rows with legacy-only items during a partial backfill', () => {
    const items = resolveBatchItems({
      batchItems: [
        {
          data: {
            id: 'from-row',
            reviewDecision: 'APPROVED',
          },
          isDeleted: false,
        },
        {
          data: { id: 'tombstone' },
          isDeleted: true,
        },
      ],
      items: [
        { id: 'from-row', reviewDecision: 'REJECTED' },
        { id: 'tombstone', reviewDecision: 'APPROVED' },
        { id: 'from-json', reviewDecision: 'REJECTED' },
      ],
    });

    expect(items).toEqual([
      expect.objectContaining({
        id: 'from-row',
        reviewDecision: ReviewDecision.APPROVED,
      }),
      expect.objectContaining({
        id: 'from-json',
        reviewDecision: ReviewDecision.REJECTED,
      }),
    ]);
  });

  it('keeps tombstones authoritative when no live typed rows remain', () => {
    const items = resolveBatchItems({
      batchItems: [{ data: { id: 'deleted' }, isDeleted: true }],
      items: [
        { id: 'deleted', reviewDecision: 'APPROVED' },
        { id: 'legacy-only', reviewDecision: 'UNSET' },
      ],
    });

    expect(items.map((item) => item.id)).toEqual(['legacy-only']);
  });

  it('prefers the typed assigneeId column over JSON identity', () => {
    const items = resolveBatchItems({
      batchItems: [
        {
          assigneeId: 'user-typed',
          data: {
            assignee: {
              displayName: 'Should not leak',
              email: 'secret@example.com',
              id: 'user-json',
            },
            assigneeId: 'user-json',
            id: 'from-row',
            reviewDecision: 'UNSET',
          },
          isDeleted: false,
        },
      ],
    });

    expect(items).toEqual([
      expect.objectContaining({
        assigneeId: 'user-typed',
        id: 'from-row',
      }),
    ]);
    expect(items[0]).not.toHaveProperty('assignee.email');
  });

  it('falls back to Batch.items JSON when typed rows are absent', () => {
    const items = resolveBatchItems({
      items: [{ id: 'from-json', reviewDecision: 'APPROVED' }],
    });

    expect(items).toEqual([
      expect.objectContaining({
        id: 'from-json',
        reviewDecision: ReviewDecision.APPROVED,
      }),
    ]);
  });
});

describe('toBatchWithConfig persisted config validation', () => {
  it('drops malformed nested fields while preserving valid siblings', () => {
    const batch = toBatchWithConfig({
      batchItems: [],
      config: {
        contentMix: {
          carouselPercent: 20,
          imagePercent: 20,
          reelPercent: 20,
          storyPercent: '20',
          videoPercent: 20,
        },
        credits: { chargedCredits: '10' },
        platforms: ['instagram', 42],
        pricing: { includeMedia: 'yes' },
        source: 'calendar',
        topics: ['launch'],
      },
      items: [],
    } as never);

    expect(batch.config).toEqual({
      source: 'calendar',
      topics: ['launch'],
    });
  });

  it('preserves valid nested config values', () => {
    const batch = toBatchWithConfig({
      batchItems: [],
      config: {
        contentMix: {
          carouselPercent: 20,
          imagePercent: 20,
          reelPercent: 20,
          storyPercent: 20,
          videoPercent: 20,
        },
        credits: {
          chargedCredits: 8,
          refundedCredits: 2,
          reservationId: 'reservation',
          reservationSettledAt: '2026-09-04T10:00:00.000Z',
          settledAt: '2026-09-04T10:01:00.000Z',
          settlementSeq: 3,
        },
        platforms: ['instagram', 'tiktok'],
        pricing: {
          chatModelRoundCredits: null,
          includeMedia: true,
          qualityTier: 'balanced',
        },
        resumeCount: 1,
      },
      items: [],
    } as never);

    expect(batch.config).toMatchObject({
      contentMix: { storyPercent: 20 },
      credits: { chargedCredits: 8, settlementSeq: 3 },
      platforms: ['instagram', 'tiktok'],
      pricing: {
        chatModelRoundCredits: null,
        includeMedia: true,
        qualityTier: 'balanced',
      },
      resumeCount: 1,
    });
  });
});
