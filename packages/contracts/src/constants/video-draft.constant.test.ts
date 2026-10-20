import { describe, expect, it } from 'vitest';
import { MODEL_KEYS } from './model-keys.constant';
import { resolveVideoDraftModelKey } from './video-draft.constant';

describe('resolveVideoDraftModelKey', () => {
  it('maps Veo to its fast sibling', () => {
    expect(resolveVideoDraftModelKey(MODEL_KEYS.REPLICATE_GOOGLE_VEO_3_1)).toBe(
      MODEL_KEYS.REPLICATE_GOOGLE_VEO_3_1_FAST,
    );
  });

  it('drafts a model with no sibling on itself', () => {
    expect(
      resolveVideoDraftModelKey(MODEL_KEYS.REPLICATE_KWAIVGI_KLING_V3_VIDEO),
    ).toBe(MODEL_KEYS.REPLICATE_KWAIVGI_KLING_V3_VIDEO);
  });
});
