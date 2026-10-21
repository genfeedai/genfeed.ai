import {
  BrandedGenerationFeedbackSerializer,
  BrandedGenerationFeedbackSummarySerializer,
} from '@serializers/server/content/branded-generation-feedback.serializer';
import { describe, expect, it } from 'vitest';

const feedback = {
  id: 'receipt',
  implicit: {
    isDiscarded: false,
    isEdited: true,
    postStatus: 'draft',
    reviewDecision: null,
  },
  ratedAt: '2026-10-17T10:00:00.000Z',
  rating: 'down',
  reasons: ['off_voice', 'too_long'],
  receiptId: 'receipt',
};
const summary = {
  byMode: [{ down: 0, mode: 'approved_brand', up: 3 }],
  down: 0,
  id: 'brand',
  reasons: [{ count: 0, reason: 'off_voice' }],
  up: 3,
  windowDays: 30,
};

describe('BrandedGenerationFeedbackSerializer', () => {
  it('serializes the own rating with the implicit signals', () => {
    const document = BrandedGenerationFeedbackSerializer.serialize(feedback);
    expect(document.data).toMatchObject({
      attributes: {
        implicit: feedback.implicit,
        rating: 'down',
        reasons: ['off_voice', 'too_long'],
      },
      id: 'receipt',
      type: 'branded-generation-feedback',
    });
  });

  it('rejects a rating outside the contract instead of serializing it', () => {
    expect(() =>
      BrandedGenerationFeedbackSerializer.serialize({
        ...feedback,
        rating: 'sideways',
      }),
    ).toThrow();
    expect(() =>
      BrandedGenerationFeedbackSerializer.serialize({
        ...feedback,
        actorId: 'PRIVATE_ACTOR',
      }),
    ).toThrow();
  });

  it('preserves each receipt rating and implicit signals in a collection', () => {
    const entries = [
      feedback,
      {
        ...feedback,
        id: 'receipt-2',
        implicit: { ...feedback.implicit, isEdited: false },
        rating: 'up',
        reasons: [],
        receiptId: 'receipt-2',
      },
    ];
    const before = structuredClone(entries);

    expect(BrandedGenerationFeedbackSerializer.serialize(entries).data).toEqual(
      [
        {
          attributes: {
            implicit: feedback.implicit,
            ratedAt: '2026-10-17T10:00:00.000Z',
            rating: 'down',
            reasons: ['off_voice', 'too_long'],
            receiptId: 'receipt',
          },
          id: 'receipt',
          type: 'branded-generation-feedback',
        },
        {
          attributes: {
            implicit: { ...feedback.implicit, isEdited: false },
            ratedAt: '2026-10-17T10:00:00.000Z',
            rating: 'up',
            reasons: [],
            receiptId: 'receipt-2',
          },
          id: 'receipt-2',
          type: 'branded-generation-feedback',
        },
      ],
    );
    expect(entries).toEqual(before);
  });

  it.each([{ rating: 'sideways' }, { actorId: 'PRIVATE_ACTOR' }])(
    'rejects a collection containing a later invalid feedback entry: %j',
    (patch) => {
      expect(() =>
        BrandedGenerationFeedbackSerializer.serialize([
          feedback,
          { ...feedback, ...patch },
        ]),
      ).toThrow();
    },
  );
});

describe('BrandedGenerationFeedbackSummarySerializer', () => {
  it('serializes counts by reason and receipt mode', () => {
    const document =
      BrandedGenerationFeedbackSummarySerializer.serialize(summary);
    expect(document.data).toMatchObject({
      attributes: { byMode: summary.byMode, up: 3, windowDays: 30 },
      id: 'brand',
      type: 'branded-generation-feedback-summary',
    });
  });

  it('keeps counts scoped to each brand in a collection', () => {
    const entries = [
      summary,
      { ...summary, id: 'brand-2', up: 0, byMode: [], reasons: [] },
    ];
    const before = structuredClone(entries);

    expect(
      BrandedGenerationFeedbackSummarySerializer.serialize(entries).data,
    ).toEqual([
      {
        attributes: {
          byMode: [{ down: 0, mode: 'approved_brand', up: 3 }],
          down: 0,
          reasons: [{ count: 0, reason: 'off_voice' }],
          up: 3,
          windowDays: 30,
        },
        id: 'brand',
        type: 'branded-generation-feedback-summary',
      },
      {
        attributes: { byMode: [], down: 0, reasons: [], up: 0, windowDays: 30 },
        id: 'brand-2',
        type: 'branded-generation-feedback-summary',
      },
    ]);
    expect(entries).toEqual(before);
  });

  it.each([{ up: -1 }, { actorId: 'PRIVATE_ACTOR' }])(
    'rejects a collection containing a later invalid summary: %j',
    (patch) => {
      expect(() =>
        BrandedGenerationFeedbackSummarySerializer.serialize([
          summary,
          { ...summary, ...patch },
        ]),
      ).toThrow();
    },
  );
});

it.each([
  BrandedGenerationFeedbackSerializer,
  BrandedGenerationFeedbackSummarySerializer,
])(
  'serializes absent and empty feedback without inventing resources',
  (serializer) => {
    expect(serializer.serialize(null).data).toBeNull();
    expect(serializer.serialize([]).data).toEqual([]);
  },
);
