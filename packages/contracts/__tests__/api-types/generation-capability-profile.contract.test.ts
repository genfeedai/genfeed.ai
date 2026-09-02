import { describe, expect, test } from 'vitest';
import {
  FLUX_SCHNELL_ASPECT_RATIOS,
  FLUX_SCHNELL_CAPABILITY_PROFILE,
  FLUX_SCHNELL_CAPABILITY_PROFILE_ID,
  FLUX_SCHNELL_CAPABILITY_PROFILE_VERSION,
  FLUX_SCHNELL_MODEL_KEY,
  generationCapabilityProfileSchema,
} from '../../src/api-types/contracts/generation-capability-profile.contract';

describe('FLUX Schnell capability profile', () => {
  test('parses the versioned FLUX Schnell profile without extension fields', () => {
    const profile = generationCapabilityProfileSchema.parse(
      FLUX_SCHNELL_CAPABILITY_PROFILE,
    );

    expect(profile.id).toBe(FLUX_SCHNELL_CAPABILITY_PROFILE_ID);
    expect(profile.version).toBe(FLUX_SCHNELL_CAPABILITY_PROFILE_VERSION);
    expect(profile.modelKey).toBe(FLUX_SCHNELL_MODEL_KEY);
    expect(profile.mediaKind).toBe('image');
    expect(profile.generationModes).toEqual(['text_to_image']);
    expect(profile.negativePrompt.supported).toBe(false);
    expect(profile.references).toEqual({
      max: 0,
      nativeFields: [],
      roles: [],
    });
    expect(profile.seed.supported).toBe(true);
    expect(profile.prompt.enhancement).toBe('unsupported');
    expect(profile.isBatchSupported).toBe(false);
  });

  test('locks FLUX Schnell native defaults used by the dedicated builder', () => {
    expect(FLUX_SCHNELL_CAPABILITY_PROFILE.defaults).toEqual({
      disableSafetyChecker: false,
      goFast: true,
      numInferenceSteps: 4,
      numOutputs: 1,
      outputFormat: 'jpg',
      outputQuality: 80,
    });
    expect(FLUX_SCHNELL_CAPABILITY_PROFILE.aspectRatios).toEqual([
      ...FLUX_SCHNELL_ASPECT_RATIOS,
    ]);
    expect(FLUX_SCHNELL_CAPABILITY_PROFILE.defaultAspectRatio).toBe('1:1');
  });

  test('rejects unknown fields and invalid versions', () => {
    expect(
      generationCapabilityProfileSchema.safeParse({
        ...FLUX_SCHNELL_CAPABILITY_PROFILE,
        apiKey: 'must-not-enter-the-profile',
      }).success,
    ).toBe(false);
    expect(
      generationCapabilityProfileSchema.safeParse({
        ...FLUX_SCHNELL_CAPABILITY_PROFILE,
        version: 0,
      }).success,
    ).toBe(false);
  });
});
