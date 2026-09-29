import { evaluateModerationVerdict } from '@api/services/moderation/moderation-verdict.util';
import { DEFAULT_MODERATION_THRESHOLDS } from '@genfeedai/contracts/api-types/contracts';

describe('evaluateModerationVerdict', () => {
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
