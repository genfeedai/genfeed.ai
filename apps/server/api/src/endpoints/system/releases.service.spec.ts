import { afterEach, describe, expect, it, vi } from 'vitest';
import { ReleasesService } from './releases.service';

afterEach(() => vi.unstubAllGlobals());
describe('ReleasesService', () => {
  it('fetches stable release metadata on the API host and caches it', async () => {
    const fetcher = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          tag_name: 'v0.1.71',
          draft: false,
          prerelease: false,
        }),
      ),
    );
    vi.stubGlobal('fetch', fetcher);
    const service = new ReleasesService();
    const release = await service.latest();
    expect(release).toEqual({
      tag: 'v0.1.71',
      version: '0.1.71',
      url: 'https://github.com/genfeedai/genfeed.ai/releases/tag/v0.1.71',
    });
    expect(await service.latest()).toEqual(release);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it('returns unavailable for GitHub failures without caching an empty result', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response('', { status: 429 })),
    );
    await expect(new ReleasesService().latest()).rejects.toThrow(
      'Could not check',
    );
  });
  it('rejects a prerelease response', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            tag_name: 'v1.0.0',
            draft: false,
            prerelease: true,
          }),
        ),
      ),
    );
    await expect(new ReleasesService().latest()).rejects.toThrow(
      'Could not check',
    );
  });
});
