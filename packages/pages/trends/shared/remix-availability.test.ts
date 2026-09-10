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
      opensPrefilledRemix: true,
      opensRemixPage: false,
    });
  });

  it('opens Discovery remix for an X post with a durable reference', () => {
    const result = getTrendRemixAvailability('twitter', true, true);

    expect(result).toEqual({
      isRemixUnavailable: false,
      opensPrefilledRemix: true,
      opensRemixPage: false,
    });
  });

  it('falls back to /publishing/remix when the Discovery surface is missing but the platform still supports variations', () => {
    const result = getTrendRemixAvailability('linkedin', true, false);

    expect(result).toEqual({
      isRemixUnavailable: false,
      opensPrefilledRemix: false,
      opensRemixPage: true,
    });
  });

  it('has no remix path without a durable source reference', () => {
    const result = getTrendRemixAvailability('instagram', false, true);

    expect(result).toEqual({
      isRemixUnavailable: false,
      opensPrefilledRemix: false,
      opensRemixPage: false,
    });
  });

  it('has no remix path on a platform that is neither Discovery nor variation-eligible', () => {
    const result = getTrendRemixAvailability('reddit', true, true);

    expect(result).toEqual({
      isRemixUnavailable: false,
      opensPrefilledRemix: false,
      opensRemixPage: false,
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

  it('opens the prefilled remix for an X source post', () => {
    expect(getSourcePostRemixAvailability('twitter', true)).toEqual({
      opensPrefilledRemix: true,
    });
  });

  it('does not open the prefilled remix on a non-Discovery platform', () => {
    expect(getSourcePostRemixAvailability('linkedin', true)).toEqual({
      opensPrefilledRemix: false,
    });
  });
});
