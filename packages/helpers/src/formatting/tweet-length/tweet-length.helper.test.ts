import {
  calculateTweetLength,
  isTweetTooLong,
} from '@helpers/formatting/tweet-length/tweet-length.helper';
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

  describe('isTweetTooLong', () => {
    it('returns false for short tweets', () => {
      expect(isTweetTooLong('Hello world')).toBe(false);
    });

    it('returns false for exactly 280 characters', () => {
      expect(isTweetTooLong('a'.repeat(280))).toBe(false);
    });

    it('returns true for 281 characters', () => {
      expect(isTweetTooLong('a'.repeat(281))).toBe(true);
    });

    it('returns false for empty string', () => {
      expect(isTweetTooLong('')).toBe(false);
    });

    it('accounts for URL shortening in length check', () => {
      // 260 chars of text + 1 URL (23) = 283 > 280
      const text = `${'a'.repeat(260)} https://example.com`;
      expect(isTweetTooLong(text)).toBe(true);
    });

    it('passes when URL shortening keeps it under 280', () => {
      // 250 chars of text + " " + URL(23) = 274 <= 280
      const text = `${'a'.repeat(250)} https://example.com`;
      expect(isTweetTooLong(text)).toBe(false);
    });
  });
});
