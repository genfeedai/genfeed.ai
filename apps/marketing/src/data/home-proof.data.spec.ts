import {
  HOME_PROOF_BRANDS,
  loadHomeProof,
  parseProofArticles,
  parseProofPosts,
  toProofCaption,
} from '@data/home-proof.data';
import { afterEach, describe, expect, it, vi } from 'vitest';

const SHAYLA = HOME_PROOF_BRANDS[0];
const KORO = HOME_PROOF_BRANDS[1];
const VINCENT = HOME_PROOF_BRANDS[2];

function post(overrides: {
  attributes?: Record<string, unknown>;
  brandId?: string;
  id?: string;
}) {
  return {
    attributes: {
      category: 'IMAGE',
      description: 'A caption',
      label: 'Airport day',
      platform: 'instagram',
      publishedAt: '2026-11-26T10:00:00.000Z',
      url: 'https://www.instagram.com/p/abc',
      ...overrides.attributes,
    },
    id: overrides.id ?? 'post-1',
    relationships: { brand: { data: { id: overrides.brandId ?? SHAYLA.id } } },
  };
}

function jsonResponse(data: unknown[]): Response {
  return new Response(JSON.stringify({ data }), { status: 200 });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('toProofCaption', () => {
  it('drops hashtags and markup and cuts a long caption at a word', () => {
    expect(
      toProofCaption('<p>Day one at my desk</p> #buildinpublic #dogs'),
    ).toBe('Day one at my desk');

    const long = toProofCaption(`${'word '.repeat(60)}end`);
    expect(long.endsWith('…')).toBe(true);
    expect(long.length).toBeLessThanOrEqual(141);
  });
});

describe('parseProofPosts', () => {
  it('keeps picture posts of our own brands that have a live https link', () => {
    const posts = parseProofPosts([
      post({ id: 'ours' }),
      post({ brandId: 'someone-elses-brand', id: 'theirs' }),
      post({ attributes: { category: 'VIDEO' }, id: 'video' }),
      post({ attributes: { url: 'http://insecure.example/p/1' }, id: 'http' }),
      post({ attributes: { url: '' }, id: 'no-link' }),
      post({ attributes: { publishedAt: '' }, id: 'unpublished' }),
    ]);

    expect(posts.map((item) => item.id)).toEqual(['ours']);
    expect(posts[0]).toMatchObject({
      brandName: 'Shayla Monroe',
      platform: 'instagram',
      url: 'https://www.instagram.com/p/abc',
    });
  });

  it('carries no view or like count, because public posts hold none yet', () => {
    const [first] = parseProofPosts([post({ id: 'ours' })]);

    expect(Object.keys(first).sort()).toEqual([
      'brandName',
      'caption',
      'id',
      'label',
      'platform',
      'publishedAt',
      'url',
    ]);
  });
});

describe('parseProofArticles', () => {
  it('links each article to its page on our profile and keeps only a real cover', () => {
    const articles = parseProofArticles([
      {
        attributes: {
          coverImageUrl: 'https://cdn.genfeed.ai/assets/cards/a.jpg',
          label: 'The Content Abundance Era',
          publishedAt: '2026-11-20T08:00:00.000Z',
          slug: 'the-content-abundance-era',
        },
        id: 'article-1',
      },
      {
        attributes: {
          coverImageUrl: 'not a url',
          label: 'No cover',
          publishedAt: '2026-11-19T08:00:00.000Z',
          slug: 'no-cover',
        },
        id: 'article-2',
      },
      { attributes: { label: 'No slug', publishedAt: '2026-11-18' }, id: 'x' },
    ]);

    expect(articles).toEqual([
      {
        coverImageUrl: 'https://cdn.genfeed.ai/assets/cards/a.jpg',
        id: 'article-1',
        label: 'The Content Abundance Era',
        publishedAt: '2026-11-20T08:00:00.000Z',
        url: '/@vincentshipsit/articles/the-content-abundance-era',
      },
      {
        coverImageUrl: null,
        id: 'article-2',
        label: 'No cover',
        publishedAt: '2026-11-19T08:00:00.000Z',
        url: '/@vincentshipsit/articles/no-cover',
      },
    ]);
  });
});

describe('loadHomeProof', () => {
  it('asks for each of our brands and lists the newest post first', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('/public/articles')) {
        return jsonResponse([]);
      }
      if (url.includes(`brand=${SHAYLA.id}`)) {
        return jsonResponse([
          post({
            attributes: { publishedAt: '2026-11-24T10:00:00.000Z' },
            id: 'older',
          }),
        ]);
      }
      if (url.includes(`brand=${KORO.id}`)) {
        return jsonResponse([
          post({
            attributes: { publishedAt: '2026-11-27T10:00:00.000Z' },
            brandId: KORO.id,
            id: 'newest',
          }),
        ]);
      }
      return jsonResponse([]);
    });
    vi.stubGlobal('fetch', fetchMock);

    const { posts } = await loadHomeProof();

    expect(posts.map((item) => item.id)).toEqual(['newest', 'older']);
    const urls = fetchMock.mock.calls.map(([input]) => String(input));
    for (const brand of HOME_PROOF_BRANDS) {
      expect(
        urls.some((url) => url.includes(`/public/posts?brand=${brand.id}`)),
      ).toBe(true);
    }
    expect(
      urls.some((url) => url.includes(`/public/articles?brand=${VINCENT.id}`)),
    ).toBe(true);
  });

  it('answers nothing, not a made-up post, when the API fails', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new Error('network down');
      }),
    );

    await expect(loadHomeProof()).resolves.toEqual({ articles: [], posts: [] });
  });

  it('answers nothing when the API returns an error status', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('{}', { status: 500 })),
    );

    await expect(loadHomeProof()).resolves.toEqual({ articles: [], posts: [] });
  });
});
