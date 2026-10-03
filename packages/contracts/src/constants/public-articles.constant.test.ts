import { describe, expect, it } from 'vitest';
import {
  ARTICLE_SLUG_MAX_LENGTH,
  ARTICLE_SLUG_PATTERN,
  normalizeArticleSlug,
} from './public-articles.constant';

describe('normalizeArticleSlug', () => {
  it('folds a domain-bearing model slug into the public slug shape', () => {
    expect(normalizeArticleSlug('test-artcile-for-genfeed.ai')).toBe(
      'test-artcile-for-genfeed-ai',
    );
  });

  it('turns a title into a slug', () => {
    expect(normalizeArticleSlug('  Café: 10 Tips & Tricks!  ')).toBe(
      'cafe-10-tips-tricks',
    );
  });

  it('returns an empty string when nothing usable remains', () => {
    expect(normalizeArticleSlug('…!!!')).toBe('');
  });

  it('caps the length without leaving a trailing hyphen', () => {
    const slug = normalizeArticleSlug(`${'a'.repeat(159)} b`);
    expect(slug.length).toBeLessThanOrEqual(ARTICLE_SLUG_MAX_LENGTH);
    expect(slug).toMatch(ARTICLE_SLUG_PATTERN);
  });
});
