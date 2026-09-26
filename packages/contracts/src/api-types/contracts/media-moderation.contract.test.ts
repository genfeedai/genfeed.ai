import { describe, expect, it } from 'vitest';
import { ModerationCategory } from '../../enums/moderation-category.enum';
import {
  DEFAULT_MODERATION_THRESHOLDS,
  mediaModerationRecordSchema,
  moderationScoresSchema,
} from './media-moderation.contract';

describe('media moderation contract', () => {
  it('has a default threshold for every category', () => {
    expect(Object.keys(DEFAULT_MODERATION_THRESHOLDS).sort()).toEqual(
      Object.values(ModerationCategory).sort(),
    );
  });

  it('rejects unknown categories and out-of-range confidences', () => {
    expect(moderationScoresSchema.safeParse({ hate: 0.4 }).success).toBe(true);
    expect(moderationScoresSchema.safeParse({ spooky: 0.4 }).success).toBe(
      false,
    );
    expect(moderationScoresSchema.safeParse({ hate: 1.4 }).success).toBe(false);
  });

  it('parses a shadow record whose candidate would have flagged', () => {
    const clean = {
      flaggedCategories: [],
      isFlagged: false,
      maxConfidence: 0.9,
      triggers: [],
    };
    const result = mediaModerationRecordSchema.safeParse({
      assetHash: 'a'.repeat(64),
      candidateVerdict: {
        ...clean,
        flaggedCategories: ['violence'],
        isFlagged: true,
        triggers: [
          {
            category: 'violence',
            confidence: 0.9,
            frameIndex: 2,
            source: 'frame',
            threshold: 0.7,
          },
        ],
      },
      inputs: [{ frameIndex: 2, scores: { violence: 0.9 }, source: 'frame' }],
      mode: 'shadow',
      provider: 'openai',
      thresholds: { violence: 0.7 },
      verdict: clean,
    });
    expect(result.success).toBe(true);
  });
});
