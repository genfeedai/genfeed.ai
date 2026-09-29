import { REMAINING_VIDEO_GENERATION_BRIEF_FAMILIES } from '@api/services/generation-brief/remaining-video-generation-brief-families';
import { resolveVideoGenerationBriefSupport } from '@api/services/generation-brief/resolve-video-generation-brief-support';
import { ModelCategory } from '@genfeedai/contracts';
import { MODEL_OUTPUT_CAPABILITIES } from '@genfeedai/contracts/constants';
import { describe, expect, it } from 'vitest';

const VIDEO_MODEL_KEYS = Object.entries(MODEL_OUTPUT_CAPABILITIES)
  .filter(([, capability]) => capability.category === ModelCategory.VIDEO)
  .map(([modelKey]) => modelKey);

const COMPILED_REMAINING_MODEL_KEYS = new Set(
  REMAINING_VIDEO_GENERATION_BRIEF_FAMILIES.flatMap((family) =>
    family.profiles.map((profile) => profile.modelKey),
  ),
);

describe('resolveVideoGenerationBriefSupport', () => {
  it('covers every catalog video model key with compile or enumerated exempt support', () => {
    for (const modelKey of VIDEO_MODEL_KEYS) {
      const support = resolveVideoGenerationBriefSupport(modelKey);
      expect(['compile', 'exempt']).toContain(support.kind);
      if (support.kind === 'exempt') {
        expect(support.reason).not.toBe('unregistered_model');
      }
    }
  });
});
