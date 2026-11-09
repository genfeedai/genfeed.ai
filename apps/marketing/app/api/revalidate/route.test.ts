import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const revalidated: string[][] = [];

vi.mock('next/cache', () => ({
  revalidatePath: (path: string, type?: string) => {
    revalidated.push(type ? [path, type] : [path]);
  },
}));

const { POST } = await import('./route');

function revalidateRequest(authorization?: string): Request {
  return new Request('https://genfeed.example/api/revalidate', {
    headers: authorization ? { authorization } : {},
    method: 'POST',
  });
}

beforeEach(() => {
  revalidated.length = 0;
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('POST /api/revalidate', () => {
  it('clears every cached page for the API holding the shared secret', async () => {
    vi.stubEnv('WEBSITE_REVALIDATE_SECRET', 'shared-secret');

    const response = await POST(revalidateRequest('Bearer shared-secret'));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ revalidated: true });
    expect(revalidated).toEqual([['/', 'layout']]);
  });

  it.each([
    ['no token', undefined],
    ['a wrong token', 'Bearer other-secret'],
    ['a token of another length', 'Bearer shared'],
    ['a token without the bearer scheme', 'shared-secret'],
  ])('refuses %s', async (_label, authorization) => {
    vi.stubEnv('WEBSITE_REVALIDATE_SECRET', 'shared-secret');

    const response = await POST(revalidateRequest(authorization));

    expect(response.status).toBe(401);
    expect(revalidated).toEqual([]);
  });

  it('refuses every caller while no secret is configured', async () => {
    vi.stubEnv('WEBSITE_REVALIDATE_SECRET', '');

    const response = await POST(revalidateRequest('Bearer '));

    expect(response.status).toBe(401);
    expect(revalidated).toEqual([]);
  });
});
