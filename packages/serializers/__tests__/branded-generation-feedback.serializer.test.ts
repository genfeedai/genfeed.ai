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
});

describe('BrandedGenerationFeedbackSummarySerializer', () => {
  it('serializes counts by reason and receipt mode', () => {
    const summary = {
      byMode: [{ down: 0, mode: 'approved_brand', up: 3 }],
      down: 0,
      id: 'brand',
      reasons: [{ count: 0, reason: 'off_voice' }],
      up: 3,
      windowDays: 30,
    };
    const document =
      BrandedGenerationFeedbackSummarySerializer.serialize(summary);
    expect(document.data).toMatchObject({
      attributes: { byMode: summary.byMode, up: 3, windowDays: 30 },
      id: 'brand',
      type: 'branded-generation-feedback-summary',
    });
  });
});
