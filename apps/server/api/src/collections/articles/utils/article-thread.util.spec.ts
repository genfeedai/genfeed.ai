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
