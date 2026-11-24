import { describe, expect, it } from 'vitest';
import {
  PublicArticleGenerationSerializer,
  PublicArticleSerializer,
  PublicArticleSummarySerializer,
} from './article.serializer';

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

describe('PublicArticleSummarySerializer', () => {
  it('serves a list item without the body, with its reading time', () => {
    const { data } = PublicArticleSummarySerializer.serialize({
      ...PUBLISHED_ARTICLE,
      readingTimeMinutes: 7,
    });
    const attributes = Array.isArray(data) ? undefined : data?.attributes;

    expect(attributes).toEqual({
      category: 'POST',
      coverImageUrl: 'https://cdn.genfeed.ai/cover.jpg',
      label: 'Launch week',
      publishedAt: '2026-11-01T00:00:00.000Z',
      readingTimeMinutes: 7,
      slug: 'launch-week',
      summary: 'What shipped.',
    });
    expect(attributes).not.toHaveProperty('content');
  });

  it('keeps a page of 53 long articles under 60 KB', () => {
    const body = `<p>${'word '.repeat(4000)}</p>`;
    const page = Array.from({ length: 53 }, (_, index) => ({
      ...PUBLISHED_ARTICLE,
      content: body,
      id: `ckarticle${String(index).padStart(15, '0')}`,
      readingTimeMinutes: 20,
      slug: `article-${index}`,
    }));
    const serialized = JSON.stringify(
      page.map((article) => PublicArticleSummarySerializer.serialize(article)),
    );

    expect(serialized.length).toBeLessThan(60_000);
    expect(serialized).not.toContain('word word');
  });
});

describe('PublicArticleGenerationSerializer', () => {
  it('serves the block: output kind, model and prompt, and nothing private', () => {
    expect(
      PublicArticleGenerationSerializer.serialize({
        category: 'IMAGE',
        generationCredits: 12,
        id: 'ckingredient0000000000001',
        metadata: {
          description: 'A bear sheet for the cast.',
          id: 'ckmetadata00000000000001',
          label: 'Bear Sheet',
          model: 'flux-2',
          modelLabel: 'Flux 2',
          result: 's3://private/key',
        },
        prompt: {
          id: 'ckprompt0000000000000001',
          original: 'A friendly bear, character sheet',
          renderedPrompt: 'internal rendering',
        },
        s3Key: 'ingredients/private.jpg',
        status: 'GENERATED',
      }),
    ).toEqual({
      data: {
        attributes: { category: 'IMAGE', status: 'GENERATED' },
        id: 'ckingredient0000000000001',
        relationships: {
          metadata: {
            data: { id: 'ckmetadata00000000000001', type: 'metadata' },
          },
          prompt: { data: { id: 'ckprompt0000000000000001', type: 'prompt' } },
        },
        type: 'ingredient',
      },
      included: [
        {
          attributes: {
            description: 'A bear sheet for the cast.',
            label: 'Bear Sheet',
            model: 'flux-2',
            modelLabel: 'Flux 2',
          },
          id: 'ckmetadata00000000000001',
          type: 'metadata',
        },
        {
          attributes: { original: 'A friendly bear, character sheet' },
          id: 'ckprompt0000000000000001',
          type: 'prompt',
        },
      ],
    });
  });
});
