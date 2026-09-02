import { DesktopOs } from '@genfeedai/contracts';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  DESKTOP_RELEASES_URL,
  detectDesktopOs,
  formatFileSize,
  getLatestDesktopBuild,
  redirectToLatestDesktopBuild,
} from './desktop-release.data';

vi.mock('@services/core/logger.service', () => ({
  logger: { error: vi.fn(), info: vi.fn(), warn: vi.fn() },
}));

const DOWNLOAD_BASE =
  'https://github.com/genfeedai/genfeed.ai/releases/download';

function headersOf(headers: Record<string, string>): Headers {
  return new Headers(headers);
}

function release(
  tagName: string,
  assetNames: string[],
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    assets: assetNames.map((name) => ({
      browser_download_url: `${DOWNLOAD_BASE}/${tagName}/${name}`,
      name,
      size: 148_000_000,
    })),
    draft: false,
    published_at: '2026-08-09T10:00:00Z',
    tag_name: tagName,
    ...overrides,
  };
}

function mockReleases(releases: unknown): void {
  vi.stubGlobal(
    'fetch',
    vi.fn(() =>
      Promise.resolve(
        new Response(JSON.stringify(releases), {
          headers: { 'Content-Type': 'application/json' },
          status: 200,
        }),
      ),
    ),
  );
}

beforeEach(() => {
  vi.unstubAllEnvs();
  vi.stubEnv('GITHUB_TOKEN', '');
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe('detectDesktopOs', () => {
  it('trusts the client hint over the user agent', () => {
    // Windows Chrome carries a Windows UA; the hint must not be second-guessed.
    expect(
      detectDesktopOs(
        headersOf({
          'sec-ch-ua-platform': '"macOS"',
          'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
        }),
      ),
    ).toBe(DesktopOs.MAC_OS);

    expect(
      detectDesktopOs(headersOf({ 'sec-ch-ua-platform': '"Windows"' })),
    ).toBe(DesktopOs.WINDOWS);
  });

  it('treats every other hinted platform as unsupported', () => {
    for (const platform of ['"Linux"', '"Android"', '"Chrome OS"', '"Unknown"'])
      expect(
        detectDesktopOs(headersOf({ 'sec-ch-ua-platform': platform })),
      ).toBe(DesktopOs.OTHER);
  });

  it('falls back to the user agent when no hint is sent', () => {
    expect(
      detectDesktopOs(
        headersOf({
          'user-agent':
            'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Version/18.0 Safari/605.1.15',
        }),
      ),
    ).toBe(DesktopOs.MAC_OS);

    expect(
      detectDesktopOs(
        headersOf({
          'user-agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:130.0) Gecko/20100101 Firefox/130.0',
        }),
      ),
    ).toBe(DesktopOs.WINDOWS);
  });

  it('does not read iOS as macOS', () => {
    // iOS Safari's UA contains the literal string "like Mac OS X", so a naive
    // macOS regex offers an iPhone visitor a disk image.
    expect(
      detectDesktopOs(
        headersOf({
          'user-agent':
            'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 Safari/604.1',
        }),
      ),
    ).toBe(DesktopOs.OTHER);
  });

  it('reports unsupported rather than guessing when nothing matches', () => {
    expect(detectDesktopOs(headersOf({}))).toBe(DesktopOs.OTHER);
    expect(detectDesktopOs(headersOf({ 'user-agent': 'curl/8.7.1' }))).toBe(
      DesktopOs.OTHER,
    );
  });
});

describe('getLatestDesktopBuild', () => {
  it('scans past product releases to the newest desktop tag', async () => {
    // `make_latest: false` keeps desktop builds out of /releases/latest, so the
    // product release legitimately sits first in the list.
    mockReleases([
      release('v2.4.0', ['genfeed-2.4.0.tar.gz']),
      release('desktop-v0.2.0', ['GenFeed-0.2.0-arm64.dmg']),
      release('desktop-v0.1.0', ['GenFeed-0.1.0-arm64.dmg']),
    ]);

    const build = await getLatestDesktopBuild();

    expect(build).toEqual({
      downloadUrl: `${DOWNLOAD_BASE}/desktop-v0.2.0/GenFeed-0.2.0-arm64.dmg`,
      fileSizeBytes: 148_000_000,
      publishedAt: '2026-08-09T10:00:00Z',
      version: '0.2.0',
    });
  });

  it('skips drafts', async () => {
    mockReleases([
      release('desktop-v0.3.0', ['GenFeed-0.3.0-arm64.dmg'], { draft: true }),
      release('desktop-v0.2.0', ['GenFeed-0.2.0-arm64.dmg']),
    ]);

    expect((await getLatestDesktopBuild())?.version).toBe('0.2.0');
  });

  it('ignores artifacts that are not the macOS arm64 disk image', async () => {
    mockReleases([
      release('desktop-v0.2.0', [
        'GenFeed-0.2.0-arm64.zip',
        'GenFeed-0.2.0-arm64-mac.zip.blockmap',
        'latest-mac.yml',
      ]),
      release('desktop-v0.1.0', ['GenFeed-0.1.0-arm64.dmg']),
    ]);

    expect((await getLatestDesktopBuild())?.version).toBe('0.1.0');
  });

  it('rejects an asset URL hosted outside the Genfeed org', async () => {
    mockReleases([
      {
        assets: [
          {
            browser_download_url:
              'https://github.com/attacker/genfeed.ai/releases/download/desktop-v9.9.9/GenFeed-9.9.9-arm64.dmg',
            name: 'GenFeed-9.9.9-arm64.dmg',
            size: 1,
          },
        ],
        draft: false,
        published_at: '2026-08-09T10:00:00Z',
        tag_name: 'desktop-v9.9.9',
      },
    ]);

    expect(await getLatestDesktopBuild()).toBeNull();
  });

  it('returns null before the first desktop tag exists', async () => {
    mockReleases([release('v2.4.0', ['genfeed-2.4.0.tar.gz'])]);

    expect(await getLatestDesktopBuild()).toBeNull();
  });

  it('returns null when GitHub errors or is unreachable', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() =>
        Promise.resolve(new Response('rate limited', { status: 403 })),
      ),
    );
    expect(await getLatestDesktopBuild()).toBeNull();

    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.reject(new Error('ECONNRESET'))),
    );
    expect(await getLatestDesktopBuild()).toBeNull();
  });

  it('retries unauthenticated when the token is rejected', async () => {
    vi.stubEnv('GITHUB_TOKEN', 'ghp_expired');

    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response('bad credentials', { status: 401 }))
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify([
            release('desktop-v0.2.0', ['GenFeed-0.2.0-arm64.dmg']),
          ]),
          { status: 200 },
        ),
      );
    vi.stubGlobal('fetch', fetchMock);

    expect((await getLatestDesktopBuild())?.version).toBe('0.2.0');
    expect(fetchMock).toHaveBeenCalledTimes(2);

    const retryHeaders = fetchMock.mock.calls[1][1].headers as Record<
      string,
      string
    >;
    expect(retryHeaders.Authorization).toBeUndefined();
  });

  it('recovers when the authenticated request times out', async () => {
    vi.useFakeTimers();
    vi.stubEnv('GITHUB_TOKEN', 'ghp_active');

    const fetchMock = vi.fn(
      (_input: Parameters<typeof fetch>[0], init?: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener(
            'abort',
            () =>
              reject(
                new DOMException('The operation was aborted.', 'AbortError'),
              ),
            { once: true },
          );
        }),
    );
    vi.stubGlobal('fetch', fetchMock);

    const buildPromise = getLatestDesktopBuild();
    await vi.advanceTimersByTimeAsync(10_001);

    await expect(buildPromise).resolves.toBeNull();

    const redirectPromise = redirectToLatestDesktopBuild();
    await vi.advanceTimersByTimeAsync(10_001);
    const response = await redirectPromise;

    expect(response.headers.get('Location')).toBe(DESKTOP_RELEASES_URL);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('recovers when the anonymous retry times out', async () => {
    vi.useFakeTimers();
    vi.stubEnv('GITHUB_TOKEN', 'ghp_expired');

    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response('bad credentials', { status: 401 }))
      .mockImplementationOnce(
        (_input: Parameters<typeof fetch>[0], init?: RequestInit) =>
          new Promise<Response>((_resolve, reject) => {
            init?.signal?.addEventListener(
              'abort',
              () =>
                reject(
                  new DOMException('The operation was aborted.', 'AbortError'),
                ),
              { once: true },
            );
          }),
      );
    vi.stubGlobal('fetch', fetchMock);

    const buildPromise = getLatestDesktopBuild();
    await vi.advanceTimersByTimeAsync(10_001);

    await expect(buildPromise).resolves.toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[0][1]?.signal).toBeInstanceOf(AbortSignal);
    expect(fetchMock.mock.calls[1][1]?.signal).toBeInstanceOf(AbortSignal);
    expect(fetchMock.mock.calls[0][1]?.signal).not.toBe(
      fetchMock.mock.calls[1][1]?.signal,
    );
  });

  it('finds a desktop release on a later page', async () => {
    const firstPage = Array.from({ length: 100 }, (_, index) =>
      release(`v2.4.${index}`, [`genfeed-2.4.${index}.tar.gz`]),
    );
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify(firstPage), {
          headers: {
            Link: '<https://api.github.com/repositories/1/releases?page=2>; rel="next"',
          },
          status: 200,
        }),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify([
            release('desktop-v0.2.0', ['GenFeed-0.2.0-arm64.dmg']),
          ]),
          { status: 200 },
        ),
      );
    vi.stubGlobal('fetch', fetchMock);

    expect((await getLatestDesktopBuild())?.version).toBe('0.2.0');
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('returns null when pagination is exhausted', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify([release('v2.4.0', [])]), {
          headers: {
            Link: '<https://api.github.com/repositories/1/releases?page=2>; rel="next"',
          },
          status: 200,
        }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify([release('v2.3.0', [])]), { status: 200 }),
      );
    vi.stubGlobal('fetch', fetchMock);

    expect(await getLatestDesktopBuild()).toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('stops pagination at a malformed Link header', async () => {
    const fetchMock = vi.fn(() =>
      Promise.resolve(
        new Response(JSON.stringify([release('v2.4.0', [])]), {
          headers: { Link: 'not a valid link' },
          status: 200,
        }),
      ),
    );
    vi.stubGlobal('fetch', fetchMock);

    expect(await getLatestDesktopBuild()).toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('does not follow an off-host next page', async () => {
    const fetchMock = vi.fn(() =>
      Promise.resolve(
        new Response(JSON.stringify([release('v2.4.0', [])]), {
          headers: {
            Link: '<https://example.com/releases?page=2>; rel="next"',
          },
          status: 200,
        }),
      ),
    );
    vi.stubGlobal('fetch', fetchMock);

    expect(await getLatestDesktopBuild()).toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('stops pagination at the maximum page count', async () => {
    const fetchMock = vi.fn((_input: Parameters<typeof fetch>[0]) => {
      const nextPage = fetchMock.mock.calls.length + 1;

      return Promise.resolve(
        new Response(JSON.stringify([release(`v2.4.${nextPage}`, [])]), {
          headers: {
            Link: `<https://api.github.com/repositories/1/releases?page=${nextPage}>; rel="next"`,
          },
          status: 200,
        }),
      );
    });
    vi.stubGlobal('fetch', fetchMock);

    expect(await getLatestDesktopBuild()).toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(10);
  });
});

describe('redirectToLatestDesktopBuild', () => {
  it('sends the visitor straight to the current disk image', async () => {
    mockReleases([release('desktop-v0.2.0', ['GenFeed-0.2.0-arm64.dmg'])]);

    const response = await redirectToLatestDesktopBuild();

    expect(response.status).toBe(307);
    expect(response.headers.get('Location')).toBe(
      `${DOWNLOAD_BASE}/desktop-v0.2.0/GenFeed-0.2.0-arm64.dmg`,
    );
    expect(response.headers.get('Vary')).toContain('Sec-CH-UA-Platform');
    expect(response.headers.get('Cache-Control')).toBe('private, no-store');
  });

  it('falls back to the releases page instead of dead-ending', async () => {
    mockReleases([]);

    const response = await redirectToLatestDesktopBuild();

    expect(response.status).toBe(307);
    expect(response.headers.get('Location')).toBe(DESKTOP_RELEASES_URL);
  });
});

describe('formatFileSize', () => {
  it('renders megabytes and gigabytes', () => {
    expect(formatFileSize(148_000_000)).toBe('148 MB');
    expect(formatFileSize(2_400_000_000)).toBe('2.4 GB');
  });

  it('renders nothing rather than a fake number', () => {
    expect(formatFileSize(null)).toBeNull();
    expect(formatFileSize(0)).toBeNull();
    expect(formatFileSize(Number.NaN)).toBeNull();
  });
});
