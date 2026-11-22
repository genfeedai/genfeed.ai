import type { YoutubeService } from '@files/services/youtube/youtube.service';
import type { RedisService } from '@libs/redis/redis.service';
import type { Job } from 'bullmq';
import type { Mock } from 'vitest';
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

  function uploadJob(name = 'upload-youtube', attemptsMade = 0): Job {
    return {
      attemptsMade,
      opts: { attempts: 3 },
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
      updateData: vi.fn(async function updateData(
        this: { data: Record<string, unknown> },
        data: Record<string, unknown>,
      ) {
        this.data = data;
      }),
      updateProgress: vi.fn().mockResolvedValue(undefined),
    } as unknown as Job;
  }

  const completedEvents = () =>
    redisService.publish.mock.calls.map(([channel, event]) => [
      channel,
      event.status,
      event.result,
    ]);
  const uploaded = {
    externalId: 'yt-video-id',
    videoUrl: 'https://www.youtube.com/watch?v=yt-video-id',
  };

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
    expect(completedEvents()).toEqual([
      ['youtube:upload:complete', 'public', uploaded],
    ]);
  });

  it('skips the upload when the job already carries the external id', async () => {
    const job = uploadJob();
    job.data.externalId = 'yt-video-id';

    const result = await buildProcessor().process(job);

    expect(youtubeService.uploadVideo.mock.calls).toEqual([]);
    expect(result).toEqual({ metadata: uploaded, success: true });
    expect(completedEvents()).toEqual([
      ['youtube:upload:complete', 'public', uploaded],
    ]);
  });

  it('resolves and publishes once when the progress update fails after the upload', async () => {
    const job = uploadJob();
    (job.updateProgress as Mock).mockImplementation(async (value: number) => {
      if (value === 100) throw new Error('redis down');
    });

    await expect(buildProcessor().process(job)).resolves.toEqual({
      metadata: uploaded,
      success: true,
    });
    expect(completedEvents()).toEqual([
      ['youtube:upload:complete', 'public', uploaded],
    ]);
  });

  it('does not upload again when the retry follows a failed completion publish', async () => {
    const job = uploadJob();
    const processor = buildProcessor();
    redisService.publish.mockRejectedValueOnce(new Error('publish failed'));

    await expect(processor.process(job)).rejects.toThrow('publish failed');
    expect(job.data.externalId).toBe('yt-video-id');

    await expect(processor.process(job)).resolves.toEqual({
      metadata: uploaded,
      success: true,
    });
    expect(youtubeService.uploadVideo.mock.calls).toHaveLength(1);
    expect(
      completedEvents().filter(([, status]) => status === 'failed'),
    ).toEqual([]);
    expect(completedEvents().at(-1)).toEqual([
      'youtube:upload:complete',
      'public',
      uploaded,
    ]);
  });

  it('passes the internal canonical source key to execution without a URL grant', async () => {
    const job = uploadJob();
    job.data.sourceStorageKey = 'ingredients/videos/random%2Fsource.mp4';
    await buildProcessor().process(job);
    expect(youtubeService.uploadVideo.mock.calls[0]?.[0]).toMatchObject({
      sourceStorageKey: job.data.sourceStorageKey,
    });
  });

  it('rethrows without publishing a failed status on a non-final attempt', async () => {
    youtubeService.uploadVideo.mockRejectedValueOnce(new Error('quota'));

    await expect(buildProcessor().process(uploadJob())).rejects.toThrow(
      'quota',
    );

    expect(redisService.publish.mock.calls).toEqual([]);
  });

  it('publishes the failed status once on the final attempt and rethrows', async () => {
    youtubeService.uploadVideo.mockRejectedValueOnce(new Error('quota'));

    await expect(
      buildProcessor().process(uploadJob('upload-youtube', 2)),
    ).rejects.toThrow('quota');

    expect(redisService.publish.mock.calls).toEqual([
      [
        'youtube:upload:complete',
        expect.objectContaining({
          error: 'quota',
          postId: 'post-1',
          status: 'failed',
        }),
      ],
    ]);
  });
});
