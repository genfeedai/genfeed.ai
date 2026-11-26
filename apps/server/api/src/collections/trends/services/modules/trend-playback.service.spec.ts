import type { AuthenticatedUser } from '@api/auth/interfaces/authenticated-user.interface';
import {
  readPlaybackFields,
  TREND_PLAYBACK_RETENTION_MS,
  TrendPlaybackService,
} from '@api/collections/trends/services/modules/trend-playback.service';
import { NotFoundException } from '@api/exceptions/not-found.exception';
import {
  ForbiddenException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { of, throwError } from 'rxjs';

interface StoredVideo {
  data: Record<string, unknown>;
  id: string;
}

describe('TrendPlaybackService', () => {
  const paidUser = { organizationId: 'org-paid' } as AuthenticatedUser;
  const freeUser = { organizationId: 'org-free' } as AuthenticatedUser;
  const adminUser = {
    isSuperAdmin: true,
    organizationId: 'org-free',
  } as AuthenticatedUser;

  let videos: Map<string, StoredVideo>;
  let filesCalls: Array<{ body: Record<string, string>; url: string }>;
  let isFilesDown: boolean;
  let service: TrendPlaybackService;

  const tiktokVideo = (extra: Record<string, unknown> = {}): StoredVideo => ({
    data: {
      platform: 'tiktok',
      videoUrl: 'https://www.tiktok.com/@creator/video/1',
      ...extra,
    },
    id: 'v1',
  });

  beforeEach(() => {
    videos = new Map([['v1', tiktokVideo()]]);
    filesCalls = [];
    isFilesDown = false;

    const prisma = {
      $executeRaw: vi.fn(
        async (_strings: TemplateStringsArray, ...values: unknown[]) => {
          const sql = _strings.join('?');
          if (sql.includes('|| ')) {
            const [json, id] = values as [string, string];
            const row = videos.get(id);
            if (row) {
              row.data = { ...row.data, ...JSON.parse(json) };
            }
          } else {
            const row = videos.get(values[0] as string);
            if (row) {
              delete row.data.playbackKey;
              delete row.data.playbackUrl;
              delete row.data.playbackExpiresAtMs;
            }
          }
          return 1;
        },
      ),
      $queryRaw: vi.fn(async () =>
        [...videos.values()]
          .filter(
            (row) =>
              typeof row.data.playbackKey === 'string' &&
              (row.data.playbackExpiresAtMs as number) < Date.now(),
          )
          .map((row) => ({
            id: row.id,
            playbackKey: row.data.playbackKey as string,
          })),
      ),
      trendingVideo: {
        findFirst: vi.fn(
          async ({ where }: { where: { id: string } }) =>
            videos.get(where.id) ?? null,
        ),
      },
    };
    const paidAccess = {
      isSubscriptionGated: vi.fn(
        async (organizationId: string) => organizationId === 'org-free',
      ),
    };
    const http = {
      post: vi.fn((url: string, body: Record<string, string>) => {
        filesCalls.push({ body, url });
        if (isFilesDown) {
          return throwError(() => ({ response: { status: 500 } }));
        }
        return of({
          data: {
            playbackKey: `assets/trend-playback/${body.videoId}-1.mp4`,
            playbackUrl: `https://cdn.test/assets/trend-playback/${body.videoId}-1.mp4`,
          },
        });
      }),
    };
    service = new TrendPlaybackService(
      prisma as never,
      paidAccess as never,
      { get: vi.fn().mockReturnValue('http://files.test') } as never,
      http as never,
      { log: vi.fn(), warn: vi.fn() } as never,
    );
  });

  it('saves the clip on first play and stores a seven day copy', async () => {
    const result = await service.getPlayback('v1', paidUser);

    expect(result.playbackUrl).toBe(
      'https://cdn.test/assets/trend-playback/v1-1.mp4',
    );
    const stored = readPlaybackFields(videos.get('v1')?.data);
    expect(stored?.playbackUrl).toBe(result.playbackUrl);
    expect((stored?.playbackExpiresAtMs ?? 0) - Date.now()).toBeGreaterThan(
      TREND_PLAYBACK_RETENTION_MS - 5_000,
    );
    expect(filesCalls).toHaveLength(1);
  });

  it('reuses a live copy and restarts its seven days instead of downloading again', async () => {
    videos.set(
      'v1',
      tiktokVideo({
        playbackExpiresAtMs: Date.now() + 60_000,
        playbackKey: 'assets/trend-playback/v1-0.mp4',
        playbackUrl: 'https://cdn.test/assets/trend-playback/v1-0.mp4',
      }),
    );

    const result = await service.getPlayback('v1', paidUser);

    expect(result.playbackUrl).toBe(
      'https://cdn.test/assets/trend-playback/v1-0.mp4',
    );
    expect(filesCalls).toEqual([]);
    expect(
      (readPlaybackFields(videos.get('v1')?.data)?.playbackExpiresAtMs ?? 0) -
        Date.now(),
    ).toBeGreaterThan(TREND_PLAYBACK_RETENTION_MS - 5_000);
  });

  it('downloads a video once when two people press play together', async () => {
    const [first, second] = await Promise.all([
      service.getPlayback('v1', paidUser),
      service.getPlayback('v1', paidUser),
    ]);

    expect(first.playbackUrl).toBe(second.playbackUrl);
    expect(filesCalls).toHaveLength(1);
  });

  it('keeps the free plan out and downloads nothing', async () => {
    await expect(service.getPlayback('v1', freeUser)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    expect(filesCalls).toEqual([]);
  });

  it('lets a super admin play without a plan', async () => {
    await expect(service.getPlayback('v1', adminUser)).resolves.toMatchObject({
      playbackUrl: expect.stringContaining('v1'),
    });
  });

  it('refuses a missing video and a platform that is not saved', async () => {
    await expect(service.getPlayback('nope', paidUser)).rejects.toBeInstanceOf(
      NotFoundException,
    );
    videos.set('yt', {
      data: {
        platform: 'youtube',
        videoUrl: 'https://www.youtube.com/watch?v=a',
      },
      id: 'yt',
    });
    await expect(service.getPlayback('yt', paidUser)).rejects.toBeInstanceOf(
      UnprocessableEntityException,
    );
  });

  it('refuses a stored url that is not a TikTok or Instagram page', async () => {
    videos.set('v1', {
      data: { platform: 'tiktok', videoUrl: 'http://169.254.169.254/latest' },
      id: 'v1',
    });
    await expect(service.getPlayback('v1', paidUser)).rejects.toBeInstanceOf(
      UnprocessableEntityException,
    );
    expect(filesCalls).toEqual([]);
  });

  it('answers "cannot be played here" when the download fails, and saves nothing', async () => {
    isFilesDown = true;

    await expect(service.getPlayback('v1', paidUser)).rejects.toBeInstanceOf(
      UnprocessableEntityException,
    );
    expect(readPlaybackFields(videos.get('v1')?.data)).toBeNull();
  });

  it('deletes expired copies and clears their fields, keeping live ones', async () => {
    videos.set('old', {
      data: {
        platform: 'tiktok',
        playbackExpiresAtMs: Date.now() - 1_000,
        playbackKey: 'assets/trend-playback/old.mp4',
        playbackUrl: 'https://cdn.test/assets/trend-playback/old.mp4',
      },
      id: 'old',
    });
    videos.set('live', {
      data: {
        platform: 'tiktok',
        playbackExpiresAtMs: Date.now() + 100_000,
        playbackKey: 'assets/trend-playback/live.mp4',
        playbackUrl: 'https://cdn.test/assets/trend-playback/live.mp4',
      },
      id: 'live',
    });

    const removed = await service.removeExpiredCopies();

    expect(removed).toBe(1);
    expect(filesCalls.map((call) => call.body.playbackKey)).toEqual([
      'assets/trend-playback/old.mp4',
    ]);
    expect(readPlaybackFields(videos.get('old')?.data)).toBeNull();
    expect(readPlaybackFields(videos.get('live')?.data)).not.toBeNull();
  });

  it('keeps the fields when the object could not be deleted, so the next run retries', async () => {
    videos.set('old', {
      data: {
        platform: 'tiktok',
        playbackExpiresAtMs: Date.now() - 1_000,
        playbackKey: 'assets/trend-playback/old.mp4',
        playbackUrl: 'https://cdn.test/assets/trend-playback/old.mp4',
      },
      id: 'old',
    });
    isFilesDown = true;

    await expect(service.removeExpiredCopies()).resolves.toBe(0);
    expect(readPlaybackFields(videos.get('old')?.data)).not.toBeNull();
  });
});
