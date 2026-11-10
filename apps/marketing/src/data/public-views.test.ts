import { afterEach, describe, expect, it, vi } from 'vitest';
import { trackPublicMediaViews, trackPublicView } from './public-views';

function answer(status: number, body: unknown): void {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => new Response(JSON.stringify(body), { status })),
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('trackPublicView', () => {
  it('answers the view count of a public profile', async () => {
    answer(201, { data: { views: 42 } });

    await expect(trackPublicView('profile', 'brand-1')).resolves.toBe(42);
  });

  it.each([
    ['the page is not public', 201, { data: null }],
    ['the API refuses the call', 429, { message: 'Too many requests' }],
  ])('answers null when %s', async (_label, status, body) => {
    answer(status, body);

    await expect(trackPublicView('profile', 'brand-1')).resolves.toBeNull();
  });

  it.each([
    ['profile', '/public/brands/brand%201/views'],
    ['article', '/public/articles/brand%201/views'],
  ] as const)('posts a %s visit to %s', async (target, path) => {
    answer(201, { data: { views: 1 } });

    await trackPublicView(target, 'brand 1');

    const [url] = vi.mocked(fetch).mock.calls[0] as [string];
    expect(new URL(url).pathname.endsWith(path)).toBe(true);
  });
});

describe('trackPublicMediaViews', () => {
  it('answers the counts of the items the API knows', async () => {
    answer(201, { data: { views: { 'video-1': 3, 'video-2': 'x' } } });

    await expect(
      trackPublicMediaViews(['video-1', 'video-2']),
    ).resolves.toEqual({ 'video-1': 3 });
    const [url, init] = vi.mocked(fetch).mock.calls[0] as [string, RequestInit];
    expect(new URL(url).pathname.endsWith('/public/media/views')).toBe(true);
    expect(init.body).toBe(JSON.stringify({ ids: ['video-1', 'video-2'] }));
  });

  it('answers nothing when the API refuses the call', async () => {
    answer(429, { message: 'Too many requests' });

    await expect(trackPublicMediaViews(['video-1'])).resolves.toEqual({});
  });

  it('makes no call for an empty gallery', async () => {
    answer(201, {});

    await expect(trackPublicMediaViews([])).resolves.toEqual({});
    expect(fetch).not.toHaveBeenCalled();
  });
});
