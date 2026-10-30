import { createShortLinkHostRewrite } from '@api/common/middleware/short-link-host.middleware';
import type { Request, Response } from 'express';

function run(
  rewrite: ReturnType<typeof createShortLinkHostRewrite>,
  request: { hostname: string; method?: string; url: string },
): string {
  const req = { method: 'GET', ...request } as Request;
  const next = vi.fn();
  rewrite(req, {} as Response, next);
  expect(next).toHaveBeenCalledOnce();
  return req.url;
}

describe('createShortLinkHostRewrite', () => {
  const rewrite = createShortLinkHostRewrite('https://go.genfeed.ai', 'v1');

  it('routes a short host code to the redirect controller', () => {
    expect(run(rewrite, { hostname: 'go.genfeed.ai', url: '/Ab3dE9xQ' })).toBe(
      '/v1/l/Ab3dE9xQ',
    );
  });

  it('keeps the query string', () => {
    expect(
      run(rewrite, { hostname: 'go.genfeed.ai', url: '/Ab3dE9xQ?x=1' }),
    ).toBe('/v1/l/Ab3dE9xQ?x=1');
  });

  it('leaves other hosts untouched', () => {
    expect(
      run(rewrite, { hostname: 'api.genfeed.ai', url: '/v1/posts' }),
    ).toBe('/v1/posts');
  });

  it('leaves non-GET requests on the short host untouched', () => {
    expect(
      run(rewrite, { hostname: 'go.genfeed.ai', method: 'POST', url: '/x' }),
    ).toBe('/x');
  });

  it('follows a configured base URL', () => {
    const custom = createShortLinkHostRewrite('https://gf.example/', 'v1');

    expect(run(custom, { hostname: 'gf.example', url: '/abc' })).toBe(
      '/v1/l/abc',
    );
  });
});
