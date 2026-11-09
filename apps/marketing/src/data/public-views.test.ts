import { afterEach, describe, expect, it, vi } from 'vitest';
import { trackPublicView } from './public-views';

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
