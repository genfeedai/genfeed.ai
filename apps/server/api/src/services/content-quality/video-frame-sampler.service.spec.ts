import { ExternalServiceException } from '@api/helpers/exceptions/external/external-service.exception';
import {
  FIRST_MIDDLE_LAST_POSITIONS,
  VideoFrameSamplerService,
} from '@api/services/content-quality/video-frame-sampler.service';
import { beforeEach, describe, expect, it, vi } from 'vitest';

function setup() {
  const filesClient = {
    deleteStoredObject: vi.fn().mockResolvedValue(undefined),
    extractMetadataFromUrl: vi.fn().mockResolvedValue({ duration: 20 }),
    generateThumbnail: vi.fn(
      (_url: string, frameId: string, _seconds: number) =>
        Promise.resolve({ thumbnailUrl: `https://cdn.test/${frameId}.jpg` }),
    ),
  };
  const mediaUrl = {
    buildUrlFromAbsolute: vi.fn((url: string) => `${url}?sig=1`),
  };
  const logger = { error: vi.fn(), warn: vi.fn() };
  const service = new VideoFrameSamplerService(
    filesClient as never,
    mediaUrl as never,
    logger as never,
  );
  return { filesClient, service };
}

describe('VideoFrameSamplerService', () => {
  let ctx: ReturnType<typeof setup>;

  beforeEach(() => {
    ctx = setup();
  });

  it('samples the first, middle and last frame, with the last just inside the end', async () => {
    const sample = await ctx.service.sample(
      'https://example.com/v.mp4',
      FIRST_MIDDLE_LAST_POSITIONS,
      40,
    );

    expect(sample.frames.map((frame) => frame.seconds)).toEqual([0, 20, 39.9]);
    expect(sample.frames.map((frame) => frame.position)).toEqual([0, 0.5, 1]);
    expect(sample.frames.every((frame) => frame.url.endsWith('?sig=1'))).toBe(
      true,
    );
    expect(ctx.filesClient.extractMetadataFromUrl).not.toHaveBeenCalled();
  });

  it('probes the video for its duration when none is stored', async () => {
    const sample = await ctx.service.sample(
      'https://example.com/v.mp4',
      FIRST_MIDDLE_LAST_POSITIONS,
    );

    expect(sample.frames.map((frame) => frame.seconds)).toEqual([0, 10, 19.9]);
  });

  it('deletes every sampled frame on cleanup', async () => {
    const sample = await ctx.service.sample(
      'https://example.com/v.mp4',
      FIRST_MIDDLE_LAST_POSITIONS,
      40,
    );
    await sample.cleanup();

    expect(
      ctx.filesClient.deleteStoredObject.mock.calls.map((call) => call[0]),
    ).toEqual(
      ctx.filesClient.generateThumbnail.mock.calls.map(
        (call) => `ingredients/thumbnails/${call[1]}`,
      ),
    );
  });

  it('deletes the frames it made and throws when a frame cannot be extracted', async () => {
    ctx.filesClient.generateThumbnail
      .mockResolvedValueOnce({ thumbnailUrl: 'https://cdn.test/a.jpg' })
      .mockRejectedValueOnce(new Error('ffmpeg failed'));

    await expect(
      ctx.service.sample(
        'https://example.com/v.mp4',
        FIRST_MIDDLE_LAST_POSITIONS,
        40,
      ),
    ).rejects.toThrow(ExternalServiceException);
    expect(ctx.filesClient.deleteStoredObject).toHaveBeenCalledTimes(2);
  });

  it('throws when the duration cannot be read', async () => {
    ctx.filesClient.extractMetadataFromUrl.mockResolvedValue({});

    await expect(
      ctx.service.sample(
        'https://example.com/v.mp4',
        FIRST_MIDDLE_LAST_POSITIONS,
      ),
    ).rejects.toThrow(ExternalServiceException);
    expect(ctx.filesClient.generateThumbnail).not.toHaveBeenCalled();
  });
});
