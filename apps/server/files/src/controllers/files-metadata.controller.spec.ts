import type { ConfigService } from '@files/config/config.service';
import { FilesMetadataController } from '@files/controllers/files-metadata.controller';
import type { TempFileCleanupCron } from '@files/cron/temp-file-cleanup.cron';
import type { FFmpegService } from '@files/services/ffmpeg/services/ffmpeg.service';
import type { LoggerService } from '@libs/logger/logger.service';
import { HttpException } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { guardedFetch, writeFileSync } = vi.hoisted(() => ({
  guardedFetch: vi.fn(),
  writeFileSync: vi.fn(),
}));
vi.mock('@libs/security/destination-guard', () => ({
  safeFetch: guardedFetch,
}));
vi.mock('node:fs', () => ({
  existsSync: vi.fn(() => true),
  mkdirSync: vi.fn(),
  unlinkSync: vi.fn(),
  writeFileSync,
}));

describe('FilesMetadataController URL download', () => {
  const getVideoMetadata = vi.fn();
  const config = {
    get: (key: string) =>
      ({
        GENFEEDAI_CDN_URL: 'http://minio:9000/bucket',
        GENFEEDAI_MICROSERVICES_FILES_URL: 'http://files:3012',
      })[key],
  };
  const controller = new FilesMetadataController(
    { getVideoMetadata } as unknown as FFmpegService,
    config as unknown as ConfigService,
    { log: vi.fn(), error: vi.fn() } as unknown as LoggerService,
    { cleanupTempFiles: vi.fn() } as unknown as TempFileCleanupCron,
  );

  beforeEach(() => {
    guardedFetch.mockReset();
    writeFileSync.mockClear();
    getVideoMetadata.mockReset().mockResolvedValue({ duration: 5 });
  });

  it('routes external narration through the DNS-pinned public destination guard', async () => {
    guardedFetch.mockResolvedValue(
      new Response('audio', {
        headers: { 'content-type': 'audio/mpeg' },
      }),
    );
    const result = await controller.getFileMetadata({
      url: 'https://audio.example/narration.mp3',
    });
    expect(guardedFetch).toHaveBeenCalledWith(
      'https://audio.example/narration.mp3',
      { signal: expect.any(AbortSignal) },
      {},
    );
    expect(result).toMatchObject({
      duration: 5,
      cachedFileName: expect.stringMatching(/\.mp3$/),
    });
    expect(writeFileSync).toHaveBeenCalledWith(
      expect.any(String),
      Buffer.from('audio'),
    );
  });

  it('permits only the exact configured storage origin on a private network', async () => {
    guardedFetch.mockResolvedValue(new Response('audio'));
    await controller.getFileMetadata({
      url: 'http://minio:9000/bucket/audio.wav',
    });
    expect(guardedFetch).toHaveBeenCalledWith(
      'http://minio:9000/bucket/audio.wav',
      expect.any(Object),
      { allowedOrigins: ['http://minio:9000'], allowPrivateNetwork: true },
    );
  });

  it('never probes or writes media when a private address or redirect is rejected', async () => {
    guardedFetch.mockRejectedValue(new Error('Destination address is blocked'));
    await expect(
      controller.getFileMetadata({ url: 'https://audio.example/redirect' }),
    ).rejects.toBeInstanceOf(HttpException);
    expect(writeFileSync).not.toHaveBeenCalled();
    expect(getVideoMetadata).not.toHaveBeenCalled();
  });

  it('rejects oversized responses before buffering or probing', async () => {
    guardedFetch.mockResolvedValue(
      new Response('audio', {
        headers: { 'content-length': String(101 * 1024 * 1024) },
      }),
    );
    await expect(
      controller.getFileMetadata({ url: 'https://audio.example/large' }),
    ).rejects.toMatchObject({ status: 413 });
    expect(writeFileSync).not.toHaveBeenCalled();
    expect(getVideoMetadata).not.toHaveBeenCalled();
  });
});
