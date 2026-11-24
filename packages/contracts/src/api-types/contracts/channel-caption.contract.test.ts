import { describe, expect, it } from 'vitest';
import {
  countHashtags,
  describeCaptionLengthRule,
  describeHashtagRule,
} from './channel-caption.contract';

describe('describeCaptionLengthRule', () => {
  it('holds a channel without an extended ceiling to its limit', () => {
    expect(describeCaptionLengthRule({ maxLength: 3000 })).toBe(
      'stay within 3000 characters',
    );
  });

  it('names the standard length and keeps the ceiling as a bound, not a target', () => {
    expect(
      describeCaptionLengthRule({ extendedMaxLength: 25_000, maxLength: 280 }),
    ).toBe(
      'stay within 280 characters unless the brief or the brand voice asks for a longer post (never more than 25000 characters)',
    );
  });
});

describe('describeHashtagRule', () => {
  it('states the limit as a clause a prompt can carry', () => {
    expect(describeHashtagRule(5)).toBe('use at most 5 hashtags');
    expect(describeHashtagRule(1)).toBe('use at most 1 hashtag');
    expect(describeHashtagRule(0)).toBe('use no hashtags');
  });
});

describe('countHashtags', () => {
  it('counts each hashtag in a caption, in any script', () => {
    expect(countHashtags('Run club #run #fit #ラン and no tag here')).toBe(3);
    expect(countHashtags('No tags at all')).toBe(0);
  });
});
