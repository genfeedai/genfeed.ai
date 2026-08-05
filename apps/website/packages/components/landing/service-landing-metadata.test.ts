import { pitchLandingConfigBySlug } from '@web-components/landing/pitch-pages.data';
import { serviceLandingConfigBySlug } from '@web-components/landing/service-landings.data';
import { describe, expect, it } from 'vitest';

describe('service landing metadata', () => {
  it('keeps the public and direct-send done-for-you titles distinct', () => {
    expect(pitchLandingConfigBySlug.dfy.metaTitle).not.toBe(
      serviceLandingConfigBySlug['done-for-you'].metaTitle,
    );
  });
});
