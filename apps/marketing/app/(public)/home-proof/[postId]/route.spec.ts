import { HOME_PROOF_BRANDS } from '@data/home-proof.data';
import { testId } from '@genfeedai/helpers/testing/test-id.helper';
import type { NextRequest } from 'next/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { GET } from './route';

const POST_ID = testId('post');
const SIGNED =
  'https://cdn.genfeed.ai/public/media/x/public-share/a.png?Expires=1&Signature=s';

function postDocument(overrides: {
  brandId?: string;
  category?: string;
  cdnUrl?: string | null;
}) {
  return {
    data: {
      relationships: {
        brand: { data: { id: overrides.brandId ?? HOME_PROOF_BRANDS[0].id } },
        ingredients: { data: [{ id: 'first' }, { id: 'second' }] },
      },
    },
    included: [
      {
        attributes: {
          category: overrides.category ?? 'IMAGE',
          cdnUrl: overrides.cdnUrl === undefined ? SIGNED : overrides.cdnUrl,
        },
        id: 'first',
      },
      {
        attributes: {
          category: 'IMAGE',
          cdnUrl: 'https://cdn.genfeed.ai/second.png',
        },
        id: 'second',
      },
    ],
  };
}

function stubApi(document: unknown, status = 200) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => new Response(JSON.stringify(document), { status })),
  );
}

function call(postId: string) {
  return GET({} as NextRequest, { params: Promise.resolve({ postId }) });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('home proof picture route', () => {
  it('redirects to the first picture of one of our posts, cached for less than the signature lasts', async () => {
    stubApi(postDocument({}));

    const response = await call(POST_ID);

    expect(response.status).toBe(302);
    expect(response.headers.get('location')).toBe(SIGNED);
    expect(response.headers.get('cache-control')).toBe(
      'public, max-age=60, s-maxage=300',
    );
  });

  it('refuses a post from a brand that is not ours', async () => {
    stubApi(postDocument({ brandId: 'a-customers-brand' }));

    expect((await call(POST_ID)).status).toBe(404);
  });

  it('refuses an address that is not on the CDN, so it cannot redirect anywhere else', async () => {
    stubApi(postDocument({ cdnUrl: 'https://evil.example/a.png' }));

    expect((await call(POST_ID)).status).toBe(404);
  });

  it('refuses a first item that is not a picture', async () => {
    stubApi(postDocument({ category: 'VIDEO' }));

    expect((await call(POST_ID)).status).toBe(404);
  });

  it('refuses an id that is not a post id without calling the API', async () => {
    stubApi(postDocument({}));

    expect((await call('../../etc')).status).toBe(404);
    expect(fetch).not.toHaveBeenCalled();
  });

  it('answers 404 when the API has no such post', async () => {
    stubApi({ errors: [] }, 404);

    expect((await call(POST_ID)).status).toBe(404);
  });
});
