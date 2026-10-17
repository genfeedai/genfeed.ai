import {
  BRANDED_GENERATION_FEEDBACK_REASONS,
  brandedGenerationFeedbackInputV1Schema,
  brandedGenerationFeedbackReadV1Schema,
} from '@genfeedai/contracts/api-types/contracts/branded-generation-feedback.contract';
import { describe, expect, it } from 'vitest';

describe('branded generation feedback contract', () => {
  it('accepts a thumbs up and a thumbs down with distinct reasons', () => {
    expect(
      brandedGenerationFeedbackInputV1Schema.safeParse({
        rating: 'up',
        reasons: [],
      }).success,
    ).toBe(true);
    expect(
      brandedGenerationFeedbackInputV1Schema.safeParse({
        rating: 'down',
        reasons: [...BRANDED_GENERATION_FEEDBACK_REASONS],
      }).success,
    ).toBe(true);
  });

  it.each([
    { rating: 'up', reasons: ['off_voice'] },
    { rating: 'down', reasons: ['off_voice', 'off_voice'] },
    { rating: 'down', reasons: ['made_up'] },
    { rating: 'meh', reasons: [] },
    { rating: 'down' },
    { rating: 'down', reasons: [], note: 'free text' },
  ])('rejects %j', (value) => {
    expect(
      brandedGenerationFeedbackInputV1Schema.safeParse(value).success,
    ).toBe(false);
  });

  it('reads an unrated receipt with the implicit signals', () => {
    expect(
      brandedGenerationFeedbackReadV1Schema.safeParse({
        id: 'receipt',
        implicit: {
          isDiscarded: false,
          isEdited: null,
          postStatus: null,
          reviewDecision: null,
        },
        ratedAt: null,
        rating: null,
        reasons: [],
        receiptId: 'receipt',
      }).success,
    ).toBe(true);
  });
});
