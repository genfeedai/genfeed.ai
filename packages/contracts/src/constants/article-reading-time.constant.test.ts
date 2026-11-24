import { describe, expect, it } from 'vitest';
import {
  articleReadingTimeMinutes,
  countArticleWords,
} from './article-reading-time.constant';

describe('article reading time', () => {
  it('counts whitespace-separated words and ignores an empty body', () => {
    expect(countArticleWords('one  two\nthree')).toBe(3);
    expect(countArticleWords('')).toBe(0);
    expect(countArticleWords(undefined)).toBe(0);
  });

  it('rounds up to whole minutes at 200 words a minute', () => {
    expect(articleReadingTimeMinutes('')).toBe(0);
    expect(articleReadingTimeMinutes('short')).toBe(1);
    expect(articleReadingTimeMinutes('word '.repeat(200).trim())).toBe(1);
    expect(articleReadingTimeMinutes('word '.repeat(201).trim())).toBe(2);
  });
});
