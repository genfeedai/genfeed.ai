import { TrendPlaybackService } from '@files/services/trend-playback/trend-playback.service';
import type { UploadService } from '@files/services/upload/upload.service';
import type { YtDlpService } from '@files/services/ytdlp/ytdlp.service';
import type { LoggerService } from '@libs/logger/logger.service';
import { BadRequestException } from '@nestjs/common';

describe('TrendPlaybackService', () => {
  const storedKeys: string[] = [];
  const downloadedUrls: string[] = [];
  const logger = { log: vi.fn() } as unknown as LoggerService;

  const ytDlp = {
    downloadShortVideo: vi.fn(async (url: string, outputPath: string) => {
      downloadedUrls.push(url);
      return outputPath;
    }),
  } as unknown as YtDlpService;

  const upload = {
    deleteStoredObject: vi.fn(async (key: string) => {
      storedKeys.splice(storedKeys.indexOf(key), 1);
    }),
    uploadPublicFile: vi.fn(async (folder: string, key: string) => {
      const s3Key = `assets/${folder}/${key}`;
      storedKeys.push(s3Key);
      return { publicUrl: `https://cdn.test/${s3Key}`, s3Key, size: 1234 };
    }),
  } as unknown as UploadService;

  const service = new TrendPlaybackService(ytDlp, upload, logger);

  beforeEach(() => {
    storedKeys.length = 0;
    downloadedUrls.length = 0;
  });

  it('saves a TikTok clip under the public trend-playback folder', async () => {
    const result = await service.prepare({
      sourceUrl: 'https://www.tiktok.com/@creator/video/7300000000000000000',
      videoId: 'abc123',
    });

    expect(result.playbackKey).toMatch(
      /^assets\/trend-playback\/abc123-\d+\.mp4$/,
    );
    expect(result.playbackUrl).toBe(`https://cdn.test/${result.playbackKey}`);
    expect(result.size).toBe(1234);
    expect(storedKeys).toEqual([result.playbackKey]);
  });

  it.each([
    'https://www.youtube.com/watch?v=abc',
    'https://evil.example/tiktok.com',
    'https://nottiktok.com/video/1',
    'http://www.tiktok.com/@a/video/1',
    'not a url',
  ])('refuses %s', async (sourceUrl) => {
    await expect(
      service.prepare({ sourceUrl, videoId: 'abc123' }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(downloadedUrls).toEqual([]);
    expect(storedKeys).toEqual([]);
  });

  it('refuses a video id that could climb out of the folder', async () => {
    await expect(
      service.prepare({
        sourceUrl: 'https://www.instagram.com/reel/abc/',
        videoId: '../x',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('removes a saved copy but nothing outside the folder', async () => {
    const saved = await service.prepare({
      sourceUrl: 'https://www.instagram.com/reel/abc/',
      videoId: 'abc123',
    });

    await service.remove(saved.playbackKey);
    expect(storedKeys).toEqual([]);

    await expect(
      service.remove('ingredients/videos/someone-elses.mp4'),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
