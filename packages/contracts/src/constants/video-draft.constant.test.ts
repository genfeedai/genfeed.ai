import { describe, expect, it } from 'vitest';
import { MODEL_KEYS } from './model-keys.constant';
import { resolveVideoDraftModelKey } from './video-draft.constant';

describe('resolveVideoDraftModelKey', () => {
  it('drafts Veo 3.1 on Lite when Lite is offered', () => {
    expect(resolveVideoDraftModelKey(MODEL_KEYS.REPLICATE_GOOGLE_VEO_3_1)).toBe(
      MODEL_KEYS.REPLICATE_GOOGLE_VEO_3_1_LITE,
    );
  });

  it('falls back to the fast sibling when Lite is not offered', () => {
    expect(
      resolveVideoDraftModelKey(
        MODEL_KEYS.REPLICATE_GOOGLE_VEO_3_1,
        (key) => key !== MODEL_KEYS.REPLICATE_GOOGLE_VEO_3_1_LITE,
      ),
    ).toBe(MODEL_KEYS.REPLICATE_GOOGLE_VEO_3_1_FAST);
  });

  it('drafts Veo 3.1 fast on Lite, or on itself without Lite', () => {
    expect(
      resolveVideoDraftModelKey(MODEL_KEYS.REPLICATE_GOOGLE_VEO_3_1_FAST),
    ).toBe(MODEL_KEYS.REPLICATE_GOOGLE_VEO_3_1_LITE);
    expect(
      resolveVideoDraftModelKey(
        MODEL_KEYS.REPLICATE_GOOGLE_VEO_3_1_FAST,
        (key) => key === MODEL_KEYS.REPLICATE_GOOGLE_VEO_3_1_FAST,
      ),
    ).toBe(MODEL_KEYS.REPLICATE_GOOGLE_VEO_3_1_FAST);
  });

  it('drafts Veo 3 on its fast sibling', () => {
    expect(resolveVideoDraftModelKey(MODEL_KEYS.REPLICATE_GOOGLE_VEO_3)).toBe(
      MODEL_KEYS.REPLICATE_GOOGLE_VEO_3_FAST,
    );
  });

  it('drafts a model with no sibling on itself', () => {
    expect(
      resolveVideoDraftModelKey(MODEL_KEYS.REPLICATE_KWAIVGI_KLING_V3_VIDEO),
    ).toBe(MODEL_KEYS.REPLICATE_KWAIVGI_KLING_V3_VIDEO);
  });
});
