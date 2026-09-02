import { describe, expect, it } from 'vitest';
import {
  buildTwitterThreadTweets,
  MAX_TWEET_CHARS,
} from './article-thread.util';

describe('article-thread.util', () => {
  describe('buildTwitterThreadTweets', () => {
    it('leads with a title + summary tweet and one tweet per short paragraph', () => {
      const tweets = buildTwitterThreadTweets({
        content: 'Hello world.',
        label: 'My Title',
        summary: 'A short summary',
      });

      expect(tweets).toHaveLength(2);
      expect(tweets[0]).toEqual({
        characterCount: 'My Title\n\nA short summary'.length,
        content: 'My Title\n\nA short summary',
        order: 1,
      });
      expect(tweets[1]).toEqual({
        characterCount: 'Hello world.'.length,
        content: 'Hello world.',
        order: 2,
      });
    });

    it('falls back to the title alone when title + summary exceeds the limit', () => {
      const label = 'L'.repeat(200);
      const summary = 'S'.repeat(200);

      const tweets = buildTwitterThreadTweets({
        content: 'Body.',
        label,
        summary,
      });

      expect(tweets[0]).toEqual({
        characterCount: label.length,
        content: label,
        order: 1,
      });
    });

    it('strips HTML tags from the content before building tweets', () => {
      const tweets = buildTwitterThreadTweets({
        content: '<p>Hi <strong>there</strong></p>',
        label: 'Title',
        summary: '',
      });

      // No summary -> first tweet is the bare label
      expect(tweets[0].content).toBe('Title');
      expect(tweets[1].content).toBe('Hi there');
    });

    it('splits a paragraph longer than the limit into sentence-sized tweets', () => {
      const sentenceA = `${'a'.repeat(199)}.`; // 200 chars, ends with a period
      const sentenceB = `${'b'.repeat(199)}.`; // 200 chars
      const tweets = buildTwitterThreadTweets({
        content: `${sentenceA} ${sentenceB}`,
        label: 'Title',
        summary: '',
      });

      expect(tweets).toHaveLength(3); // title + 2 sentence tweets
      expect(tweets[1].content).toBe(sentenceA);
      expect(tweets[2].content).toBe(sentenceB);
      expect(tweets[1].order).toBe(2);
      expect(tweets[2].order).toBe(3);
      for (const tweet of tweets) {
        expect(tweet.characterCount).toBeLessThanOrEqual(MAX_TWEET_CHARS);
      }
    });

    it('hard-splits a title that alone exceeds the limit (title-only fallback)', () => {
      // Title is too long on its own, so even the title-only fallback must not
      // emit an unpostable (>280) first tweet.
      const label = 'T'.repeat(400);
      const summary = 'S'.repeat(50);

      const tweets = buildTwitterThreadTweets({
        content: 'Body.',
        label,
        summary,
      });

      // Every tweet — including the split title segments — stays within the limit.
      for (const tweet of tweets) {
        expect(tweet.characterCount).toBeLessThanOrEqual(MAX_TWEET_CHARS);
        expect(tweet.content.length).toBeLessThanOrEqual(MAX_TWEET_CHARS);
      }
      // The split title content is preserved across the leading segments.
      expect(tweets[0].order).toBe(1);
      expect(tweets[0].content.replace(/\s+/g, '')).toContain('T');
    });

    it('hard-splits a single sentence longer than the limit', () => {
      // One sentence with no internal sentence boundary and longer than 280
      // chars must be broken into multiple postable tweets, not emitted whole.
      const longSentence = `${'word '.repeat(120).trim()}.`; // ~599 chars, single sentence

      const tweets = buildTwitterThreadTweets({
        content: longSentence,
        label: 'Title',
        summary: '',
      });

      expect(tweets.length).toBeGreaterThan(2); // title + multiple split tweets
      for (const tweet of tweets) {
        expect(tweet.characterCount).toBeLessThanOrEqual(MAX_TWEET_CHARS);
        expect(tweet.content.length).toBeLessThanOrEqual(MAX_TWEET_CHARS);
      }
    });

    it('hard-splits an unbroken token longer than the limit by characters', () => {
      // A single "word" (e.g. a long URL or hash) longer than the limit has no
      // whitespace to break on and must be chunked by character count.
      const giantToken = 'x'.repeat(700);

      const tweets = buildTwitterThreadTweets({
        content: giantToken,
        label: 'Title',
        summary: '',
      });

      for (const tweet of tweets) {
        expect(tweet.characterCount).toBeLessThanOrEqual(MAX_TWEET_CHARS);
        expect(tweet.content.length).toBeLessThanOrEqual(MAX_TWEET_CHARS);
      }
      // The full token content survives, reassembled from the chunks.
      const reassembled = tweets
        .slice(1)
        .map((tweet) => tweet.content)
        .join('');
      expect(reassembled).toBe(giantToken);
    });

    it('appends a trailing link tweet only when an articleUrl is provided', () => {
      const withUrl = buildTwitterThreadTweets({
        articleUrl: 'https://genfeed.ai/articles/my-slug',
        content: 'Body.',
        label: 'Title',
        summary: '',
      });
      const last = withUrl[withUrl.length - 1];
      expect(last.content).toBe(
        'Read the full article:\nhttps://genfeed.ai/articles/my-slug',
      );

      const withoutUrl = buildTwitterThreadTweets({
        content: 'Body.',
        label: 'Title',
        summary: '',
      });
      expect(
        withoutUrl.some((tweet) =>
          tweet.content.startsWith('Read the full article:'),
        ),
      ).toBe(false);
    });

    it('never drops the link tweet — falls back to the bare URL when the prefixed form exceeds the limit', () => {
      const longUrl = `https://genfeed.ai/articles/${'a'.repeat(275)}`;
      // "Read the full article:\n" + longUrl would exceed 280.
      expect(`Read the full article:\n${longUrl}`.length).toBeGreaterThan(
        MAX_TWEET_CHARS,
      );

      const tweets = buildTwitterThreadTweets({
        articleUrl: longUrl,
        content: 'Body.',
        label: 'Title',
        summary: '',
      });
      const last = tweets[tweets.length - 1];

      // The link is still present (as the bare URL), not silently dropped.
      expect(last.content).toBe(longUrl);
      expect(last.characterCount).toBe(longUrl.length);
    });

    it('preserves the historical newline collapse (double newlines do not split paragraphs)', () => {
      // `\n+` is collapsed to a single `\n` before splitting on `\n\n+`, so a
      // double-newline-separated body becomes a single paragraph tweet.
      const tweets = buildTwitterThreadTweets({
        content: 'Para one.\n\nPara two.',
        label: 'Title',
        summary: '',
      });

      expect(tweets).toHaveLength(2); // title + single merged paragraph
      expect(tweets[1].content).toBe('Para one.\nPara two.');
    });

    it('numbers tweets sequentially starting at 1', () => {
      const tweets = buildTwitterThreadTweets({
        articleUrl: 'https://genfeed.ai/articles/slug',
        content: 'Body paragraph.',
        label: 'Title',
        summary: 'Summary',
      });

      expect(tweets.map((tweet) => tweet.order)).toEqual(
        tweets.map((_tweet, index) => index + 1),
      );
    });
  });
});
