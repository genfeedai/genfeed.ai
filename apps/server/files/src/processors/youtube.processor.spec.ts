import type { YoutubeService } from '@files/services/youtube/youtube.service';
import type { RedisService } from '@libs/redis/redis.service';
import type { Job } from 'bullmq';
import { YoutubeProcessor } from './youtube.processor';

describe('YoutubeProcessor', () => {
  const redisService = { publish: vi.fn().mockResolvedValue(undefined) };
  const youtubeService = {
    uploadVideo: vi.fn().mockResolvedValue('yt-video-id'),
  };

  function buildProcessor(): YoutubeProcessor {
    return new YoutubeProcessor(
      redisService as unknown as RedisService,
      youtubeService as unknown as YoutubeService,
    );
  }

  function uploadJob(name = 'upload-youtube'): Job {
    return {
      data: {
        credential: { accessToken: 'token' },
        ingredientId: 'ingredient-1',
        organizationId: 'org-1',
        postId: 'post-1',
        status: 'public',
        title: 'Title',
        userId: 'user-1',
      },
      id: 'job-1',
      name,
      updateProgress: vi.fn().mockResolvedValue(undefined),
    } as unknown as Job;
  }

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('hard-fails retired transcript job names', async () => {
    await expect(
      buildProcessor().process(uploadJob('youtube-download-audio')),
    ).rejects.toThrow('Unknown YouTube job type: youtube-download-audio');
  });

  it('uploads YouTube media and publishes its completion event', async () => {
    const result = await buildProcessor().process(uploadJob());

    expect(result).toEqual({
      metadata: {
        externalId: 'yt-video-id',
        videoUrl: 'https://www.youtube.com/watch?v=yt-video-id',
      },
      success: true,
    });
    expect(redisService.publish).toHaveBeenCalledWith(
      'youtube:upload:complete',
      expect.objectContaining({ postId: 'post-1', status: 'public' }),
    );
  });
});
