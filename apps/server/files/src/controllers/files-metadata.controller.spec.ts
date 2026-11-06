import type { ConfigService } from '@files/config/config.service';
import { FilesMetadataController } from '@files/controllers/files-metadata.controller';
import type { TempFileCleanupCron } from '@files/cron/temp-file-cleanup.cron';
import type { FFmpegService } from '@files/services/ffmpeg/services/ffmpeg.service';
import type { LoggerService } from '@libs/logger/logger.service';
import { HttpException } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const deployment = vi.hoisted(() => ({ selfHosted: true }));
vi.mock('@genfeedai/config', async (original) => ({
  ...(await original<Record<string, unknown>>()),
  isSelfHostedDeployment: () => deployment.selfHosted,
  isCloudDeployment: () => !deployment.selfHosted,
}));

// The network and the disk: the guard records each request with the policy
// it was given; the disk keeps every written file.
const world = vi.hoisted(() => ({
  disk: new Map<string, Buffer>(),
  requests: [] as Array<{ policy: unknown; url: string }>,
  respond: (() => new Response('audio')) as () => Response,
}));
vi.mock('@libs/security/destination-guard', () => ({
  safeFetch: async (url: string, _init: unknown, policy: unknown) => {
    world.requests.push({ policy, url });
    return world.respond();
  },
}));
vi.mock('node:fs', () => ({
  existsSync: () => true,
  mkdirSync: () => undefined,
  unlinkSync: (file: string) => {
    world.disk.delete(file);
  },
  writeFileSync: (file: string, data: Buffer) => {
    world.disk.set(file, data);
  },
}));

describe('FilesMetadataController URL download', () => {
  let probed: string[];

  const config = {
    get: (key: string) => {
      if (key === 'GENFEEDAI_CDN_URL') return 'http://minio:9000/bucket';
      if (key === 'GENFEEDAI_MICROSERVICES_FILES_URL')
        return 'http://files:3012';
      return undefined;
    },
  };
  const controller = new FilesMetadataController(
    {
      getVideoMetadata: async (filePath: string) => {
        probed.push(filePath);
        return { duration: 5 };
      },
    } as unknown as FFmpegService,
    config as unknown as ConfigService,
    { error: () => {}, log: () => {} } as unknown as LoggerService,
    { cleanupTempFiles: () => {} } as unknown as TempFileCleanupCron,
  );

  beforeEach(() => {
    deployment.selfHosted = true;
    world.disk.clear();
    world.requests.length = 0;
    world.respond = () => new Response('audio');
    probed = [];
  });

  it('downloads external narration through the public destination guard and probes the cached copy', async () => {
    world.respond = () =>
      new Response('audio', { headers: { 'content-type': 'audio/mpeg' } });

    const result = await controller.getFileMetadata({
      url: 'https://audio.example/narration.mp3',
    });

    expect(world.requests).toEqual([
      { policy: {}, url: 'https://audio.example/narration.mp3' },
    ]);
    expect(result).toMatchObject({
      cachedFileName: expect.stringMatching(/\.mp3$/),
      duration: 5,
    });
    expect([...world.disk.values()]).toEqual([Buffer.from('audio')]);
    expect(probed).toEqual([result.cachedFilePath]);
  });

  it('permits only the exact configured storage origin on a private network', async () => {
    await controller.getFileMetadata({
      url: 'http://minio:9000/bucket/audio.wav',
    });

    expect(world.requests).toEqual([
      {
        policy: {
          allowPrivateNetwork: true,
          allowedOrigins: ['http://minio:9000'],
        },
        url: 'http://minio:9000/bucket/audio.wav',
      },
    ]);
  });

  it('never probes or writes media when a private address or redirect is rejected', async () => {
    world.respond = () => {
      throw new Error('Destination address is blocked');
    };

    await expect(
      controller.getFileMetadata({ url: 'https://audio.example/redirect' }),
    ).rejects.toBeInstanceOf(HttpException);
    expect(world.disk.size).toBe(0);
    expect(probed).toEqual([]);
  });

  it('rejects oversized responses before buffering or probing', async () => {
    world.respond = () =>
      new Response('audio', {
        headers: { 'content-length': String(101 * 1024 * 1024) },
      });

    await expect(
      controller.getFileMetadata({ url: 'https://audio.example/large' }),
    ).rejects.toMatchObject({ status: 413 });
    expect(world.disk.size).toBe(0);
    expect(probed).toEqual([]);
  });

  it('refuses the Cloud files origin even for an authenticated caller', async () => {
    deployment.selfHosted = false;

    await expect(
      controller.getFileMetadata({
        url: 'http://files:3012/v1/files/download/audios/other-tenant.wav',
      }),
    ).rejects.toMatchObject({ status: 400 });
    expect(world.requests).toEqual([]);
    expect(probed).toEqual([]);
  });

  it('accepts authenticated Cloud public narration with the public destination guard', async () => {
    deployment.selfHosted = false;

    await controller.getFileMetadata({
      url: 'https://audio.example/narration.mp3',
    });

    expect(world.requests).toEqual([
      { policy: {}, url: 'https://audio.example/narration.mp3' },
    ]);
  });
});
