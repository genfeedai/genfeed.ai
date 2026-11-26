import type {
  ApifyInstagramPost,
  ApifyTikTokVideo,
} from '@api/services/integrations/apify/interfaces/apify.interfaces';
import { ApifyService } from '@api/services/integrations/apify/services/apify.service';
import { ApifyBaseService } from '@api/services/integrations/apify/services/modules/apify-base.service';
import { ApifyInstagramService } from '@api/services/integrations/apify/services/modules/apify-instagram.service';
import { ApifyTikTokService } from '@api/services/integrations/apify/services/modules/apify-tiktok.service';

const TIKTOK_ACTOR = 'clockworks/tiktok-scraper';
const INSTAGRAM_ACTOR = 'apify/instagram-hashtag-scraper';

function tiktokVideo(id: string, soundId: string, views: number) {
  return {
    authorMeta: { name: 'creator' },
    diggCount: 10,
    id,
    musicMeta: { musicId: soundId, musicName: `Sound ${soundId}` },
    playCount: views,
    text: `video ${id} #fyp`,
    webVideoUrl: `https://www.tiktok.com/@creator/video/${id}`,
  } as unknown as ApifyTikTokVideo;
}

function instagramPost(id: string, hashtags: string[]) {
  return {
    caption: `post ${id}`,
    commentsCount: 1,
    hashtags,
    id,
    likesCount: 10,
    url: `https://www.instagram.com/p/${id}/`,
  } as unknown as ApifyInstagramPost;
}

describe('one billed run per source for every dataset built from it', () => {
  let facade: ApifyService;
  let runActor: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    const store = new Map<string, unknown>();
    const cache = {
      get: vi.fn(async (key: string) => store.get(key) ?? null),
      set: vi.fn(async (key: string, value: unknown) => {
        store.set(key, value);
        return true;
      }),
    };
    const config = { get: vi.fn().mockReturnValue('test-token') };
    const logger = {
      error: vi.fn(),
      log: vi.fn(),
      warn: vi.fn(),
    };
    const base = new ApifyBaseService(
      config as never,
      logger as never,
      {} as never,
      undefined,
      cache as never,
    );
    runActor = vi.fn(async (actorId: string) => {
      if (actorId === TIKTOK_ACTOR) {
        return Array.from({ length: 24 }, (_, index) =>
          tiktokVideo(`v${index}`, `s${index % 14}`, 1000 + index),
        );
      }
      return Array.from({ length: 20 }, (_, index) =>
        instagramPost(`p${index}`, [
          `tag${index}`,
          `tag${index + 20}`,
          index < 5 ? 'viral' : 'other',
        ]),
      );
    });
    vi.spyOn(base, 'runActor').mockImplementation(runActor as never);
    facade = new ApifyService(
      base,
      new ApifyTikTokService(base, {} as never),
      new ApifyInstagramService(base, {} as never),
      {} as never,
      {} as never,
      {} as never,
    );
  });

  const callsTo = (actorId: string) =>
    runActor.mock.calls.filter(([id]) => id === actorId).length;

  it('buys the TikTok videos once and still yields 12 videos and 12 sounds', async () => {
    const videos = await facade.getTikTokVideos(12);
    const sounds = await facade.getTikTokSounds(12);

    expect(callsTo(TIKTOK_ACTOR)).toBe(1);
    expect(videos).toHaveLength(12);
    expect(sounds).toHaveLength(12);
  });

  it('buys the Instagram hashtag posts once and still yields 20 trends and 12 hashtags', async () => {
    const trends = await facade.getInstagramTrends({ limit: 20 });
    const hashtags = await facade.getTrendingHashtags('instagram', 12);

    expect(callsTo(INSTAGRAM_ACTOR)).toBe(1);
    expect(trends).toHaveLength(20);
    expect(hashtags).toHaveLength(12);
  });

  it('serves a preview for a hashtag the shared pull holds without another run', async () => {
    await facade.getInstagramTrends({ limit: 20 });

    const held = await facade.getHeldInstagramHashtagPosts('#viral', 5);

    expect(held.map((post) => post.id)).toEqual(['p0', 'p1', 'p2', 'p3', 'p4']);
    expect(callsTo(INSTAGRAM_ACTOR)).toBe(1);
  });

  it('starts one run when both datasets ask at the same moment', async () => {
    await Promise.all([
      facade.getTikTokVideos(12),
      facade.getTikTokSounds(12),
      facade.getInstagramTrends({ limit: 20 }),
      facade.getTrendingHashtags('instagram', 12),
    ]);

    expect(callsTo(TIKTOK_ACTOR)).toBe(1);
    expect(callsTo(INSTAGRAM_ACTOR)).toBe(1);
  });

  it('does not keep a failed run, so the next dataset can try again', async () => {
    runActor.mockRejectedValueOnce(new Error('actor failed'));

    await expect(facade.getTikTokVideos(12)).rejects.toThrow('actor failed');
    await expect(facade.getTikTokSounds(12)).resolves.toHaveLength(12);
  });
});
