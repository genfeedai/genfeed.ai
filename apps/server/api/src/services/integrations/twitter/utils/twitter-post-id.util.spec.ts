import { describe, expect, it } from 'vitest';
import {
  buildTwitterStatusUrl,
  parseTwitterPostId,
} from './twitter-post-id.util';

describe('parseTwitterPostId', () => {
  it('accepts bare numeric ids', () => {
    expect(parseTwitterPostId('1234567890123456789')).toBe(
      '1234567890123456789',
    );
  });

  it('parses x.com and twitter.com status URLs', () => {
    expect(
      parseTwitterPostId('https://x.com/genfeed/status/1234567890123456789'),
    ).toBe('1234567890123456789');
    expect(
      parseTwitterPostId(
        'https://twitter.com/genfeed/status/1234567890123456789?s=20',
      ),
    ).toBe('1234567890123456789');
    expect(
      parseTwitterPostId('https://x.com/i/status/1234567890123456789'),
    ).toBe('1234567890123456789');
    expect(
      parseTwitterPostId(
        'https://www.x.com/genfeed/status/1234567890123456789',
      ),
    ).toBe('1234567890123456789');
    expect(
      parseTwitterPostId(
        'https://mobile.twitter.com/genfeed/status/1234567890123456789',
      ),
    ).toBe('1234567890123456789');
  });

  it('parses path-only status links', () => {
    expect(parseTwitterPostId('/someone/status/9876543210')).toBe('9876543210');
  });

  it('rejects malformed input', () => {
    expect(parseTwitterPostId('')).toBeNull();
    expect(parseTwitterPostId('not-a-url')).toBeNull();
    expect(parseTwitterPostId('https://x.com/genfeed')).toBeNull();
    expect(parseTwitterPostId(null)).toBeNull();
  });
});

describe('buildTwitterStatusUrl', () => {
  it('builds a canonical status URL', () => {
    expect(buildTwitterStatusUrl('111', '@genfeed')).toBe(
      'https://x.com/genfeed/status/111',
    );
    expect(buildTwitterStatusUrl('111')).toBe('https://x.com/i/status/111');
  });
});
