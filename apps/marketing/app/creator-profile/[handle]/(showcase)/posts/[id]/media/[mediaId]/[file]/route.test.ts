import sharp from 'sharp';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const getCreatorPost = vi.hoisted(() => vi.fn());

vi.mock('../../../post-loader', () => ({ getCreatorPost }));

import { GET } from './route';

const PUBLIC_IMAGE_URL =
  'https://cdn.genfeed.ai/public/media/org/a.png?Expires=1';

function ingredient(id: string, category: string, url = PUBLIC_IMAGE_URL) {
  return { category, id, ingredientUrl: url, status: 'GENERATED' };
}

function publicPost(...ingredients: ReturnType<typeof ingredient>[]) {
  return {
    brand: { id: 'brand-1', slug: 'shayla' },
    handle: 'shayla',
    post: { id: 'post-1', ingredients },
  };
}

async function request(mediaId: string, file = '640.webp'): Promise<Response> {
  return await GET(new Request('https://genfeed.ai/'), {
    params: Promise.resolve({ file, handle: 'shayla', id: 'post-1', mediaId }),
  });
}

const fetchMock = vi.fn();

beforeEach(() => {
  getCreatorPost.mockReset();
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('post media rendition route', () => {
  it('serves a public post image as a WebP no wider than the file asks for', async () => {
    const png = await sharp({
      create: { background: '#336699', channels: 3, height: 1500, width: 3000 },
    })
      .png()
      .toBuffer();
    getCreatorPost.mockResolvedValue(publicPost(ingredient('img-1', 'IMAGE')));
    fetchMock.mockResolvedValue(
      new Response(new Uint8Array(png), {
        headers: { 'content-type': 'image/png' },
      }),
    );

    const response = await request('img-1', '640.webp');
    const body = Buffer.from(await response.arrayBuffer());
    const meta = await sharp(body).metadata();

    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toBe('image/webp');
    expect(response.headers.get('cache-control')).toContain('s-maxage=604800');
    expect(meta.format).toBe('webp');
    expect(meta.width).toBe(640);
    expect(body.byteLength).toBeLessThan(png.byteLength);
  });

  it('never enlarges a picture smaller than the width asked for', async () => {
    const png = await sharp({
      create: { background: '#fff', channels: 3, height: 100, width: 200 },
    })
      .png()
      .toBuffer();
    getCreatorPost.mockResolvedValue(publicPost(ingredient('img-1', 'IMAGE')));
    fetchMock.mockResolvedValue(
      new Response(new Uint8Array(png), {
        headers: { 'content-type': 'image/png' },
      }),
    );

    const meta = await sharp(
      Buffer.from(await (await request('img-1', '1280.webp')).arrayBuffer()),
    ).metadata();

    expect(meta.width).toBe(200);
  });

  describe('a private asset never reaches the public path', () => {
    it('refuses a media id the public post does not list', async () => {
      getCreatorPost.mockResolvedValue(
        publicPost(ingredient('img-1', 'IMAGE')),
      );

      const response = await request('private-asset-from-another-org');

      expect(response.status).toBe(404);
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it('refuses a post that is not public, or a handle that does not own it', async () => {
      getCreatorPost.mockResolvedValue(null);

      const response = await request('img-1');

      expect(response.status).toBe(404);
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it('refuses a video, which has no rendition', async () => {
      getCreatorPost.mockResolvedValue(
        publicPost(ingredient('vid-1', 'VIDEO')),
      );

      expect((await request('vid-1')).status).toBe(404);
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it('never fetches a source outside the Genfeed media hosts', async () => {
      getCreatorPost.mockResolvedValue(
        publicPost(
          ingredient('img-1', 'IMAGE', 'https://internal.example.com/a.png'),
        ),
      );

      expect((await request('img-1')).status).toBe(404);
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it('refuses a width that is not offered, before looking anything up', async () => {
      expect((await request('img-1', '999.webp')).status).toBe(404);
      expect((await request('img-1', '640.png')).status).toBe(404);
      expect(getCreatorPost).not.toHaveBeenCalled();
    });
  });

  it('answers 502 without caching when the grant cannot be fetched', async () => {
    getCreatorPost.mockResolvedValue(publicPost(ingredient('img-1', 'IMAGE')));
    fetchMock.mockResolvedValue(new Response('denied', { status: 403 }));

    const response = await request('img-1');

    expect(response.status).toBe(502);
    expect(response.headers.get('cache-control')).toBe('no-store');
  });
});
