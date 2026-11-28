import {
  readPlaybackFields,
  TrendPlaybackService,
} from '@api/collections/trends/services/modules/trend-playback.service';
import { of, throwError } from 'rxjs';

interface StoredVideo {
  data: Record<string, unknown>;
  id: string;
}

describe('TrendPlaybackService', () => {
  let videos: Map<string, StoredVideo>;
  let filesCalls: Array<{ body: Record<string, string>; url: string }>;
  let isFilesDown: boolean;
  let service: TrendPlaybackService;

  beforeEach(() => {
    videos = new Map();
    filesCalls = [];
    isFilesDown = false;

    const prisma = {
      $executeRaw: vi.fn(
        async (_strings: TemplateStringsArray, ...values: unknown[]) => {
          const row = videos.get(values[0] as string);
          if (row) {
            delete row.data.playbackKey;
            delete row.data.playbackUrl;
            delete row.data.playbackExpiresAtMs;
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
      { get: vi.fn().mockReturnValue('http://files.test') } as never,
      http as never,
      { log: vi.fn(), warn: vi.fn() } as never,
    );
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
