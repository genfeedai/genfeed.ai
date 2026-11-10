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

  it('counts more than one batch of ids in bounded requests', async () => {
    const ids = Array.from({ length: 100 }, (_, index) => `media-${index}`);
    // Like the API: more than 48 ids is refused, otherwise each id counts once.
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_url: string, init: RequestInit) => {
        const sent = (JSON.parse(String(init.body)) as { ids: string[] }).ids;
        return sent.length > 48
          ? new Response('{}', { status: 400 })
          : new Response(
              JSON.stringify({
                data: {
                  views: Object.fromEntries(sent.map((id) => [id, 1])),
                },
              }),
              { status: 201 },
            );
      }),
    );

    const counts = await trackPublicMediaViews(ids);

    expect(Object.keys(counts)).toHaveLength(100);
    expect(counts['media-0']).toBe(1);
    expect(counts['media-99']).toBe(1);
  });

  it('keeps the counts of the batches that went through', async () => {
    const ids = Array.from({ length: 60 }, (_, index) => `media-${index}`);
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_url: string, init: RequestInit) => {
        const sent = (JSON.parse(String(init.body)) as { ids: string[] }).ids;
        if (sent.includes('media-0')) {
          throw new TypeError('network down');
        }
        return new Response(
          JSON.stringify({
            data: { views: Object.fromEntries(sent.map((id) => [id, 2])) },
          }),
          { status: 201 },
        );
      }),
    );

    const counts = await trackPublicMediaViews(ids);

    expect(Object.keys(counts)).toHaveLength(12);
    expect(counts['media-48']).toBe(2);
    expect(counts['media-0']).toBeUndefined();
  });

  it('makes no call for an empty gallery', async () => {
    answer(201, {});

    await expect(trackPublicMediaViews([])).resolves.toEqual({});
    expect(fetch).not.toHaveBeenCalled();
  });
});
