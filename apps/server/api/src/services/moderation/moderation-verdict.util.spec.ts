import {
  applyModerationMode,
  evaluateModerationVerdict,
} from '@api/services/moderation/moderation-verdict.util';
import { ModerationCategory } from '@genfeedai/contracts';
import { DEFAULT_MODERATION_THRESHOLDS } from '@genfeedai/contracts/api-types/contracts';

describe('evaluateModerationVerdict', () => {
  it('flags a category when any input reaches its threshold', () => {
    const verdict = evaluateModerationVerdict(
      [
        { frameIndex: 0, scores: { violence: 0.1 }, source: 'frame' },
        { frameIndex: 3, scores: { violence: 0.82 }, source: 'frame' },
        { frameIndex: null, scores: { hate: 0.2 }, source: 'transcript' },
      ],
      DEFAULT_MODERATION_THRESHOLDS,
    );

    expect(verdict).toEqual({
      flaggedCategories: [ModerationCategory.VIOLENCE],
      isFlagged: true,
      maxConfidence: 0.82,
      triggers: [
        {
          category: ModerationCategory.VIOLENCE,
          confidence: 0.82,
          frameIndex: 3,
          source: 'frame',
          threshold: 0.7,
        },
      ],
    });
  });

  it('uses the stricter minors threshold and treats the boundary as flagged', () => {
    const verdict = evaluateModerationVerdict(
      [{ frameIndex: null, scores: { sexual_minors: 0.2 }, source: 'image' }],
      DEFAULT_MODERATION_THRESHOLDS,
    );
    expect(verdict.flaggedCategories).toEqual([
      ModerationCategory.SEXUAL_MINORS,
    ]);
  });

  it('is clean for no inputs', () => {
    expect(
      evaluateModerationVerdict([], DEFAULT_MODERATION_THRESHOLDS),
    ).toEqual({
      flaggedCategories: [],
      isFlagged: false,
      maxConfidence: 0,
      triggers: [],
    });
  });
});

describe('applyModerationMode', () => {
  const candidate = evaluateModerationVerdict(
    [{ frameIndex: null, scores: { hate: 0.9 }, source: 'ocr' }],
    DEFAULT_MODERATION_THRESHOLDS,
  );

  it('keeps the candidate in live mode', () => {
    expect(applyModerationMode(candidate, 'live')).toBe(candidate);
  });

  it.each(['shadow', 'off'] as const)('never flags in %s mode', (mode) => {
    expect(applyModerationMode(candidate, mode)).toEqual({
      flaggedCategories: [],
      isFlagged: false,
      maxConfidence: 0.9,
      triggers: [],
    });
  });
});
