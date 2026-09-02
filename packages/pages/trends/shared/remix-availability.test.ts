import { describe, expect, it } from 'vitest';
import {
  getSourcePostRemixAvailability,
  getTrendRemixAvailability,
} from './remix-availability';

describe('getTrendRemixAvailability', () => {
  it('opens the prefilled remix for a prefilled platform with a durable reference and an active surface', () => {
    const result = getTrendRemixAvailability('instagram', true, true);

    expect(result).toEqual({
      isRemixUnavailable: false,
      opensLegacyRemix: false,
      opensPrefilledRemix: true,
    });
  });

  it('falls back to the legacy remix link when the prefilled surface is unavailable but the platform supports the legacy flow', () => {
    const result = getTrendRemixAvailability('instagram', true, false);

    expect(result).toEqual({
      isRemixUnavailable: false,
      opensLegacyRemix: true,
      opensPrefilledRemix: false,
    });
  });

  it('has no remix path without a durable source reference', () => {
    const result = getTrendRemixAvailability('instagram', false, true);

    expect(result).toEqual({
      isRemixUnavailable: false,
      opensLegacyRemix: false,
      opensPrefilledRemix: false,
    });
  });

  it('has no remix path on a platform that is neither prefilled nor legacy-eligible', () => {
    const result = getTrendRemixAvailability('reddit', true, true);

    expect(result).toEqual({
      isRemixUnavailable: false,
      opensLegacyRemix: false,
      opensPrefilledRemix: false,
    });
  });
});

describe('getSourcePostRemixAvailability', () => {
  it('opens the prefilled remix on a prefilled platform with an active surface', () => {
    expect(getSourcePostRemixAvailability('tiktok', true)).toEqual({
      opensPrefilledRemix: true,
    });
  });

  it('does not open the prefilled remix without an active surface', () => {
    expect(getSourcePostRemixAvailability('tiktok', false)).toEqual({
      opensPrefilledRemix: false,
    });
  });

  it('does not open the prefilled remix on a non-prefilled platform', () => {
    expect(getSourcePostRemixAvailability('twitter', true)).toEqual({
      opensPrefilledRemix: false,
    });
  });
});
