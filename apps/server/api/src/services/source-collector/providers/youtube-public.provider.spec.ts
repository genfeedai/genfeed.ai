import { YoutubePublicProvider } from '@api/services/source-collector/providers/youtube-public.provider';
import { SocialSourcePlatform } from '@genfeedai/contracts';
import { of, throwError } from 'rxjs';

const CHANNEL = 'UCabcdefghijklmnopqrstuv';
const VIDEO = 'abcdefghijk';
const OTHER = 'lmnopqrstuv';

function channelPage(id = CHANNEL) {
  return of({
    data: {
      items: [
        {
          id,
          snippet: { title: 'Channel' },
          contentDetails: { relatedPlaylists: { uploads: 'UUuploads' } },
        },
      ],
    },
  });
}
function playlistPage(ids: string[], nextPageToken?: string) {
  return of({
    data: {
      items: ids.map((id) => ({ contentDetails: { videoId: id } })),
      nextPageToken,
    },
  });
}
function video(id = VIDEO, overrides: Record<string, unknown> = {}) {
  return {
    id,
    snippet: {
      channelId: CHANNEL,
      title: 'Video',
      publishedAt: '2026-09-01T10:00:00Z',
    },
    status: { privacyStatus: 'public' },
    statistics: { viewCount: '120', likeCount: '0', commentCount: '7' },
    ...overrides,
  };
}
function videosPage(items: Record<string, unknown>[]) {
  return of({ data: { items } });
}

describe('YoutubePublicProvider', () => {
  const http = { get: vi.fn() };
  const config = { get: vi.fn() };
  let provider: YoutubePublicProvider;
  const collect = (context = {}, handle = '@genfeed') =>
    provider.collectTimeline(SocialSourcePlatform.YOUTUBE, handle, context);

  beforeEach(() => {
    vi.resetAllMocks();
    config.get.mockReturnValue('private-api-key');
    provider = new YoutubePublicProvider(http as never, config as never);
  });

  it('collects public channels without owner credentials and only for YouTube with an API key', async () => {
    expect(await provider.canCollect(SocialSourcePlatform.YOUTUBE, {})).toBe(
      true,
    );
    expect(await provider.canCollect(SocialSourcePlatform.INSTAGRAM, {})).toBe(
      false,
    );
    config.get.mockReturnValue(' ');
    expect(await provider.canCollect(SocialSourcePlatform.YOUTUBE, {})).toBe(
      false,
    );
    await expect(collect()).rejects.toThrow('unavailable');
    expect(http.get).not.toHaveBeenCalled();
  });

  it.each(['@genfeed', 'genfeed', CHANNEL])(
    'resolves %s through channels and exposes metadata without media permission claims',
    async (handle) => {
      http.get
        .mockReturnValueOnce(channelPage())
        .mockReturnValueOnce(playlistPage([VIDEO]))
        .mockReturnValueOnce(
          videosPage([video(VIDEO, { contentDetails: { duration: 'PT20S' } })]),
        );
      const result = await collect(
        { credentialId: 'ignored-owner-credential' },
        handle,
      );
      expect(result.provider).toBe('app-api-key');
      expect(result.posts[0]).toMatchObject({
        id: VIDEO,
        authorId: CHANNEL,
        authorDisplayName: 'Channel',
        contentType: 'video',
        contentUrl: `https://www.youtube.com/watch?v=${VIDEO}`,
        mediaUrls: [],
        metrics: { views: 120, likes: 0, comments: 7 },
      });
      expect(http.get.mock.calls[0][1].params).toMatchObject(
        handle === CHANNEL ? { id: CHANNEL } : { forHandle: 'genfeed' },
      );
      for (const [, options] of http.get.mock.calls) {
        expect(options.timeout).toBe(15_000);
        expect(options.params.key).toBe('private-api-key');
        expect(options.params.mine).toBeUndefined();
        expect(options.headers).toBeUndefined();
      }
      expect(http.get.mock.calls[2][1].params.part).toContain('status');
    },
  );

  it('deduplicates IDs, preserves playlist order and stops on repeated tokens', async () => {
    http.get
      .mockReturnValueOnce(channelPage())
      .mockReturnValueOnce(playlistPage([VIDEO, OTHER, VIDEO], 'again'))
      .mockReturnValueOnce(videosPage([video(OTHER), video(VIDEO)]))
      .mockReturnValueOnce(playlistPage([VIDEO], 'again'));
    expect((await collect()).posts.map((post) => post.id)).toEqual([
      VIDEO,
      OTHER,
    ]);
    expect(http.get).toHaveBeenCalledTimes(4);
    expect(http.get.mock.calls[2][1].params.id).toBe(`${VIDEO},${OTHER}`);
    expect(http.get.mock.calls[3][1].params.pageToken).toBe('again');
  });

  it.each([undefined, 9999])(
    'bounds %s requested results and batches videos at 50',
    async (limit) => {
      http.get.mockReturnValueOnce(channelPage());
      for (let page = 0; page < 10; page++) {
        const ids = Array.from({ length: 50 }, (_, index) =>
          String(page * 50 + index).padStart(11, '0'),
        );
        http.get
          .mockReturnValueOnce(playlistPage(ids, `page-${page + 1}`))
          .mockReturnValueOnce(videosPage(ids.map((id) => video(id))));
      }
      const result = await collect({ limit });
      expect(result.posts).toHaveLength(limit === undefined ? 100 : 500);
      for (const [url, options] of http.get.mock.calls) {
        if (url.endsWith('/videos'))
          expect(options.params.id.split(',')).toHaveLength(50);
      }
    },
  );

  it('caps pagination even when every hydrated video is missing', async () => {
    http.get.mockReturnValueOnce(channelPage());
    for (let page = 0; page < 10; page++) {
      http.get
        .mockReturnValueOnce(
          playlistPage([String(page).padStart(11, '0')], `page-${page + 1}`),
        )
        .mockReturnValueOnce(videosPage([]));
    }
    expect((await collect()).posts).toEqual([]);
    expect(http.get).toHaveBeenCalledTimes(21);
  });

  it('caps empty pages with fresh tokens', async () => {
    http.get.mockReturnValueOnce(channelPage());
    for (let page = 0; page < 10; page++)
      http.get.mockReturnValueOnce(playlistPage([], `page-${page}`));
    expect((await collect()).posts).toEqual([]);
    expect(http.get).toHaveBeenCalledTimes(11);
  });

  it('treats a successful empty uploads playlist as success', async () => {
    http.get
      .mockReturnValueOnce(channelPage())
      .mockReturnValueOnce(playlistPage([]));
    expect(await collect()).toMatchObject({
      provider: 'app-api-key',
      posts: [],
    });
  });

  it('honors sinceId even if that video cannot be hydrated', async () => {
    http.get
      .mockReturnValueOnce(channelPage())
      .mockReturnValueOnce(playlistPage([VIDEO, OTHER], 'more'))
      .mockReturnValueOnce(videosPage([video(VIDEO)]));
    expect(
      (await collect({ sinceId: OTHER })).posts.map((post) => post.id),
    ).toEqual([VIDEO]);
    expect(http.get.mock.calls[2][1].params.id).toBe(VIDEO);
    expect(http.get).toHaveBeenCalledTimes(3);
  });

  it('stops at the hydrated publish-date cutoff', async () => {
    http.get
      .mockReturnValueOnce(channelPage())
      .mockReturnValueOnce(playlistPage([VIDEO, OTHER], 'more'))
      .mockReturnValueOnce(
        videosPage([
          video(VIDEO),
          video(OTHER, {
            snippet: {
              channelId: CHANNEL,
              publishedAt: '2026-01-01T00:00:00Z',
            },
          }),
        ]),
      );
    expect(
      (await collect({ since: new Date('2026-06-01T00:00:00Z') })).posts.map(
        (post) => post.id,
      ),
    ).toEqual([VIDEO]);
    expect(http.get).toHaveBeenCalledTimes(3);
  });

  it('stops before hydration at a playlist publish-date cutoff', async () => {
    http.get.mockReturnValueOnce(channelPage()).mockReturnValueOnce(
      of({
        data: {
          items: [
            {
              contentDetails: {
                videoId: VIDEO,
                videoPublishedAt: '2026-01-01T00:00:00Z',
              },
            },
          ],
          nextPageToken: 'more',
        },
      }),
    );
    expect(
      (await collect({ since: new Date('2026-06-01T00:00:00Z') })).posts,
    ).toEqual([]);
    expect(http.get).toHaveBeenCalledTimes(2);
  });

  it.each(['private', 'unlisted', undefined])(
    'omits %s privacy status, missing and deleted videos',
    async (privacyStatus) => {
      http.get
        .mockReturnValueOnce(channelPage())
        .mockReturnValueOnce(playlistPage([VIDEO, OTHER]))
        .mockReturnValueOnce(
          videosPage([video(VIDEO, { status: { privacyStatus } })]),
        );
      expect((await collect()).posts).toEqual([]);
    },
  );

  it.each(['deleted', 'failed', 'rejected'])(
    'omits videos with %s upload status',
    async (uploadStatus) => {
      http.get
        .mockReturnValueOnce(channelPage())
        .mockReturnValueOnce(playlistPage([VIDEO]))
        .mockReturnValueOnce(
          videosPage([
            video(VIDEO, { status: { privacyStatus: 'public', uploadStatus } }),
          ]),
        );
      expect((await collect()).posts).toEqual([]);
    },
  );

  it('omits videos from a different channel and unsolicited video IDs', async () => {
    http.get
      .mockReturnValueOnce(channelPage())
      .mockReturnValueOnce(playlistPage([VIDEO]))
      .mockReturnValueOnce(
        videosPage([
          video(VIDEO, { snippet: { channelId: 'UCdifferent' } }),
          video(OTHER),
        ]),
      );
    expect((await collect()).posts).toEqual([]);
  });

  it.each(['invalid', '2026-02-30T00:00:00Z'])(
    'omits invalid date %s and counters instead of inventing values',
    async (publishedAt) => {
      http.get
        .mockReturnValueOnce(channelPage())
        .mockReturnValueOnce(playlistPage([VIDEO]))
        .mockReturnValueOnce(
          videosPage([
            video(VIDEO, {
              snippet: { channelId: CHANNEL, publishedAt },
              statistics: {
                viewCount: '9007199254740993',
                likeCount: -1,
                commentCount: 1.5,
              },
            }),
          ]),
        );
      const post = (await collect()).posts[0];
      expect(post.createdAt).toBeUndefined();
      expect(post.metrics).toEqual({
        views: undefined,
        likes: undefined,
        comments: undefined,
      });
    },
  );

  it('excludes undated videos from a requested date window', async () => {
    http.get
      .mockReturnValueOnce(channelPage())
      .mockReturnValueOnce(playlistPage([VIDEO]))
      .mockReturnValueOnce(
        videosPage([
          video(VIDEO, {
            snippet: { channelId: CHANNEL, publishedAt: 'invalid' },
          }),
        ]),
      );
    expect(
      (await collect({ since: new Date('2026-01-01T00:00:00Z') })).posts,
    ).toEqual([]);
  });

  it.each([
    {},
    { items: [null] },
    { items: 'invalid' },
    { items: [], error: { code: 403 } },
    { items: [], nextPageToken: 42 },
  ])('rejects malformed API payload %s', async (data) => {
    http.get.mockReturnValueOnce(of({ data }));
    await expect(collect()).rejects.toThrow(
      'YouTube public API invalid-response',
    );
  });

  it.each([403, 404, 429, 500])(
    'sanitizes HTTP %s errors without retries or secret/config leakage',
    async (status) => {
      http.get.mockReturnValueOnce(
        throwError(() => ({
          message: 'private-api-key',
          config: { params: { key: 'private-api-key' } },
          response: { status },
        })),
      );
      await expect(collect()).rejects.toEqual(
        new Error(
          `YouTube public API ${status === 429 ? 'quota-limited' : status === 403 ? 'access-denied' : 'unavailable'}`,
        ),
      );
      expect(http.get).toHaveBeenCalledTimes(1);
    },
  );

  it('distinguishes quota denial from generic access denial', async () => {
    http.get.mockReturnValueOnce(
      throwError(() => ({
        response: {
          status: 403,
          data: { error: { errors: [{ reason: 'quotaExceeded' }] } },
        },
      })),
    );
    await expect(collect()).rejects.toThrow('quota-limited');
  });

  it('reports unresolved channels separately from successful empty uploads', async () => {
    http.get.mockReturnValueOnce(of({ data: { items: [] } }));
    await expect(collect()).rejects.toThrow('channel-not-found');
  });

  it('rejects a wrong-platform call without making a request', async () => {
    await expect(
      provider.collectTimeline(SocialSourcePlatform.INSTAGRAM, '@genfeed', {}),
    ).rejects.toThrow('unavailable');
    expect(http.get).not.toHaveBeenCalled();
  });

  it('rejects a channel mismatch instead of reading another channel', async () => {
    http.get.mockReturnValueOnce(channelPage('UCABCDEFGHIJKLMNOPQRSTUV'));
    await expect(collect({}, CHANNEL)).rejects.toThrow('invalid-response');
    expect(http.get).toHaveBeenCalledTimes(1);
  });

  it.each(['https://youtube.com/@genfeed', 'user/name', 'a?key=secret'])(
    'rejects unsupported target %s before requesting',
    async (handle) => {
      await expect(collect({}, handle)).rejects.toThrow('channel ID or handle');
      expect(http.get).not.toHaveBeenCalled();
    },
  );
});
