import { describe, expect, it } from 'vitest';
import { PublicArticleSerializer } from './article.serializer';

const PUBLISHED_ARTICLE = {
  brand: {
    id: 'ckbrand000000000000000001',
    isDeleted: false,
    label: 'Shayla',
    scope: 'PUBLIC',
    slug: 'shayla',
  },
  category: 'POST',
  content: '<p>Body</p>',
  coverImageUrl: 'https://cdn.genfeed.ai/cover.jpg',
  evaluation: { score: 91 },
  generationPrompt: 'private prompt',
  id: 'ckarticle0000000000000001',
  label: 'Launch week',
  organization: {
    credits: 1200,
    id: 'ckorg00000000000000000001',
    label: 'Acme',
  },
  publishedAt: '2026-11-01T00:00:00.000Z',
  seoBreakdown: { title: 10 },
  slug: 'launch-week',
  summary: 'What shipped.',
  user: {
    email: 'author@example.com',
    firstName: 'Ada',
    id: 'ckuser0000000000000000001',
    lastName: 'Lovelace',
  },
  viralityAnalysis: { score: 3 },
};

describe('PublicArticleSerializer', () => {
  it('serves the reading page and its byline, and nothing private', () => {
    expect(PublicArticleSerializer.serialize(PUBLISHED_ARTICLE)).toEqual({
      data: {
        attributes: {
          category: 'POST',
          content: '<p>Body</p>',
          coverImageUrl: 'https://cdn.genfeed.ai/cover.jpg',
          label: 'Launch week',
          publishedAt: '2026-11-01T00:00:00.000Z',
          slug: 'launch-week',
          summary: 'What shipped.',
        },
        id: 'ckarticle0000000000000001',
        relationships: {
          brand: { data: { id: 'ckbrand000000000000000001', type: 'brand' } },
          user: { data: { id: 'ckuser0000000000000000001', type: 'user' } },
        },
        type: 'article',
      },
      included: [
        {
          attributes: { firstName: 'Ada', lastName: 'Lovelace' },
          id: 'ckuser0000000000000000001',
          type: 'user',
        },
        {
          attributes: { label: 'Shayla', slug: 'shayla' },
          id: 'ckbrand000000000000000001',
          type: 'brand',
        },
      ],
    });
  });
});
