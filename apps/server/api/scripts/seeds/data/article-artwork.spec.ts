import { describe, expect, it } from 'vitest';
import {
  ARTICLE_ARTWORK_IDS,
  articleArtwork,
  resolveArticleArtworkId,
} from './article-artwork';
import { LAUNCH_ARTICLES } from './launch-articles';
import { SEO_ARTICLES } from './seo-articles';

describe('seeded article artwork identities', () => {
  const articles = [...LAUNCH_ARTICLES, ...SEO_ARTICLES];

  it('covers every seeded article with one permanent asset id', () => {
    const slugs = articles.map(({ slug }) => slug).sort();
    expect(Object.keys(ARTICLE_ARTWORK_IDS).sort()).toEqual(slugs);
    expect(new Set(Object.values(ARTICLE_ARTWORK_IDS)).size).toBe(slugs.length);
  });

  it('builds opaque CDN URLs that do not contain mutable slugs', () => {
    for (const article of articles) {
      const artworkId = resolveArticleArtworkId(article.slug);
      expect(artworkId).toMatch(/^card-\d{4}$/);
      expect(article.coverImageUrl).toBe(
        `https://cdn.genfeed.ai/assets/cards/articles/${artworkId}.webp`,
      );
      expect(article.coverImageUrl).not.toContain(article.slug);
      expect(articleArtwork(article.slug)).toBe(article.coverImageUrl);
    }
  });

  it('fails closed when a new article has no assigned asset identity', () => {
    expect(() => articleArtwork('unmapped-article')).toThrow(
      'Missing stable article artwork id for slug: unmapped-article',
    );
  });
});
