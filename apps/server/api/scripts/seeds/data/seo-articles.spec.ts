import { describe, expect, it } from 'vitest';
import { UPCOMING_SEO_ARTICLES } from './seo-articles';

describe('upcoming SEO article catalog', () => {
  it('contains thirty complete, uniquely scheduled articles', () => {
    expect(UPCOMING_SEO_ARTICLES).toHaveLength(30);
    expect(new Set(UPCOMING_SEO_ARTICLES.map(({ slug }) => slug)).size).toBe(
      30,
    );
    expect(
      new Set(UPCOMING_SEO_ARTICLES.map(({ publishedAt }) => publishedAt)).size,
    ).toBe(30);
  });

  it('publishes exactly on Tuesday and Thursday at 09:00 UTC', () => {
    for (const article of UPCOMING_SEO_ARTICLES) {
      const release = new Date(article.publishedAt);
      expect([2, 4]).toContain(release.getUTCDay());
      expect(release.getUTCHours()).toBe(9);
      expect(release.getUTCMinutes()).toBe(0);
    }
  });

  it('ships substantial HTML, sources, internal links, FAQs, and original artwork', () => {
    for (const article of UPCOMING_SEO_ARTICLES) {
      expect(article.content.length, article.slug).toBeGreaterThan(4_000);
      expect(article.content, article.slug).toContain('<h2>');
      expect(article.content, article.slug).toContain('<table>');
      expect(article.content, article.slug).toContain(
        'Frequently asked questions',
      );
      expect(article.content, article.slug).toContain(
        'Sources and further reading',
      );
      expect(article.content, article.slug).toContain('https://genfeed.ai/');
      expect(article.coverImageUrl).toBe(
        `https://cdn.genfeed.ai/assets/cards/articles/${article.slug}.webp`,
      );
    }
  });
});
