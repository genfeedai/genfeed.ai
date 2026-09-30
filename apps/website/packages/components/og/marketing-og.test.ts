// @vitest-environment node
import { MARKETING_OG_CARDS } from '@data/marketing-og.data';
import { renderMarketingOg } from '@web-components/og/marketing-og';
import { afterEach, describe, expect, it, vi } from 'vitest';

const WEBP = Buffer.from(
  'UklGRiQAAABXRUJQVlA4IBgAAAAwAQCdASoBAAEAAgA0JaQAA3AA/vuUAAA=',
  'base64',
);

afterEach(() => vi.unstubAllGlobals());

describe('marketing OG images', () => {
  it.each(['default', 'x'] as const)(
    'renders a crawler-ready %s PNG with the real bundled fonts',
    async (kind) => {
      const fetchArtwork = vi
        .fn()
        .mockResolvedValue(
          new Response(WEBP, { headers: { 'Content-Type': 'image/webp' } }),
        );
      vi.stubGlobal('fetch', fetchArtwork);

      const response = await renderMarketingOg(kind);
      const png = Buffer.from(await response.arrayBuffer());

      expect(fetchArtwork).toHaveBeenCalledWith(
        MARKETING_OG_CARDS[kind].artwork,
        expect.objectContaining({ next: { revalidate: 3600 } }),
      );
      expect(response.headers.get('content-type')).toBe('image/png');
      expect(response.headers.get('cache-control')).toContain('max-age=3600');
      expect(png.subarray(1, 4).toString()).toBe('PNG');
      expect(png.readUInt32BE(16)).toBe(1200);
      expect(png.readUInt32BE(20)).toBe(630);
    },
  );

  it.each(['unavailable', 'network error'])(
    'keeps rendering a branded PNG when the CDN has a %s',
    async (failure) => {
      vi.stubGlobal(
        'fetch',
        failure === 'unavailable'
          ? vi.fn().mockResolvedValue(new Response(null, { status: 503 }))
          : vi.fn().mockRejectedValue(new Error('Network error')),
      );

      const response = await renderMarketingOg('x');
      const png = Buffer.from(await response.arrayBuffer());
      expect(png.subarray(1, 4).toString()).toBe('PNG');
      expect(png.readUInt32BE(16)).toBe(1200);
    },
  );
});
