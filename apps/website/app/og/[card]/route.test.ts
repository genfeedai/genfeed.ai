// @vitest-environment node
import { GET } from '@website/og/[card]/route';
import { afterEach, describe, expect, it, vi } from 'vitest';

afterEach(() => vi.unstubAllGlobals());

describe('marketing OG card route', () => {
  it.each(['missing', 'toString', '__proto__'])(
    'rejects an unknown card %s without fetching artwork',
    async (card) => {
      const fetchArtwork = vi.fn();
      vi.stubGlobal('fetch', fetchArtwork);

      const response = await GET(new Request('https://genfeed.ai/og/missing'), {
        params: Promise.resolve({ card }),
      });

      expect(response.status).toBe(404);
      expect(fetchArtwork).not.toHaveBeenCalled();
    },
  );
});
