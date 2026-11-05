import { calculateTweetLength } from '@helpers/formatting/tweet-length/tweet-length.helper';
import { describe, expect, it } from 'vitest';

describe('tweet-length.helper', () => {
  describe('calculateTweetLength', () => {
    it('returns length of plain text', () => {
      expect(calculateTweetLength('hello')).toBe(5);
      expect(calculateTweetLength('')).toBe(0);
    });

    it('counts URL as 23 characters regardless of actual length', () => {
      expect(calculateTweetLength('https://example.com')).toBe(23);
      expect(calculateTweetLength('http://example.com')).toBe(23);
      expect(
        calculateTweetLength(
          'https://a-very-long-url.example.com/some/path?q=1',
        ),
      ).toBe(23);
    });

    it('counts text plus URL correctly', () => {
      // "Check this " = 11 chars + 1 URL = 11 + 23 = 34
      expect(calculateTweetLength('Check this https://example.com')).toBe(34);
    });

    it('counts multiple URLs correctly', () => {
      // "Visit " = 6 + URL(23) + " and " = 5 + URL(23) = 57
      expect(
        calculateTweetLength('Visit https://one.com and https://two.com'),
      ).toBe(57);
    });

    it('handles text with no URLs', () => {
      const text = 'Just a regular tweet with no links';
      expect(calculateTweetLength(text)).toBe(text.length);
    });
  });
});
