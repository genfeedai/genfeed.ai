import type { ConfigService } from '@files/config/config.service';
import { AudioOverlayService } from '@files/services/audio-overlay/audio-overlay.service';
import type { FFmpegService } from '@files/services/ffmpeg/services/ffmpeg.service';
import type { UploadService } from '@files/services/upload/upload.service';
import type { LoggerService } from '@libs/logger/logger.service';

/**
 * The temp directory as an in-memory file map, and the public media fetcher
 * recording each URL with its byte limit.
 */
const disk = vi.hoisted(() => ({
  downloads: [] as { limit: number; url: string }[],
  files: new Map<string, Buffer>(),
}));
vi.mock('@files/services/audio-overlay/media-download', () => ({
  downloadPublicMedia: async (url: string, limit: number) => {
    disk.downloads.push({ limit, url });
    return Buffer.from(`bytes of ${url}`);
  },
}));
vi.mock('node:fs', () => ({
  existsSync: (file: string) => disk.files.has(file),
  unlinkSync: (file: string) => disk.files.delete(file),
  writeFileSync: (file: string, data: Buffer) => disk.files.set(file, data),
}));

type Upload = { folder: string; key: string; source: Buffer | undefined };

/**
 * FFmpeg writes the mixed output into the temp map (or fails), probing
 * reports 30 seconds, and S3 uploads record the key and the bytes they read.
 */
function buildService(
  options: {
    isAuthorizedMediaDeliveryEnabled?: boolean;
    isEncoderBroken?: boolean;
    storedKey?: string;
  } = {},
) {
  const uploads: Upload[] = [];
  const ffmpeg = {
    getTempPath: () => '/tmp/overlay',
    overlayAudio: async (_video: string, _audio: string, output: string) => {
      if (options.isEncoderBroken) throw new Error('encoder failed');
      disk.files.set(output, Buffer.from('mixed'));
    },
    probe: async () => ({ format: { duration: '30' } }),
  };
  const upload = {
    uploadToS3: async (
      key: string,
      folder: string,
      file: { path: string; type: string },
    ) => {
      uploads.push({ folder, key, source: disk.files.get(file.path) });
      return {
        publicUrl: 'https://cdn.example.com/result.mp4',
        ...(options.storedKey ? { s3Key: options.storedKey } : {}),
      };
    },
  };
  const silent = () => undefined;
  const service = new AudioOverlayService(
    ffmpeg as unknown as FFmpegService,
    { error: silent, log: silent, warn: silent } as unknown as LoggerService,
    upload as unknown as UploadService,
    options.isAuthorizedMediaDeliveryEnabled
      ? ({ isAuthorizedMediaDeliveryEnabled: true } as unknown as ConfigService)
      : undefined,
  );
  return { service, uploads };
}

describe('AudioOverlayService', () => {
  beforeEach(() => {
    disk.downloads.length = 0;
    disk.files.clear();
  });

  it('ignores supplied output identity and returns the actual overlay key when activated', async () => {
    const { service, uploads } = buildService({
      isAuthorizedMediaDeliveryEnabled: true,
      storedKey: 'ingredients/videos/actual-overlay-object',
    });

    const result = await service.processAudioOverlay({
      audioUrl: 'https://cdn.test/audio',
      outputKey: 'ingredient-id',
      videoUrl: 'https://cdn.test/video',
    });

    expect(uploads).toEqual([
      {
        folder: 'videos',
        key: expect.stringMatching(/^audio-overlay\/[a-f0-9-]{36}\.mp4$/),
        source: Buffer.from('mixed'),
      },
    ]);
    expect(result.s3Key).toBe('ingredients/videos/actual-overlay-object');
  });

  it('returns the public URL and duration, keeps legacy outputUrl and clears temp files', async () => {
    const { service } = buildService();

    const result = await service.processAudioOverlay({
      audioUrl: 'https://cdn.example.com/speech.wav',
      mixMode: 'replace',
      videoUrl: 'https://cdn.example.com/video.mp4',
    });

    expect(result).toMatchObject({
      duration: 30,
      outputUrl: 'https://cdn.example.com/result.mp4',
      publicUrl: 'https://cdn.example.com/result.mp4',
    });
    expect(disk.downloads[0]).toEqual({
      limit: 500 * 1024 * 1024,
      url: 'https://cdn.example.com/video.mp4',
    });
    expect(disk.files.size).toBe(0);
  });

  it('cleans temporary downloads after an encoding failure', async () => {
    const { service, uploads } = buildService({ isEncoderBroken: true });

    await expect(
      service.processAudioOverlay({
        audioUrl: 'https://cdn.example.com/speech.wav',
        videoUrl: 'https://cdn.example.com/video.mp4',
      }),
    ).rejects.toThrow('encoder failed');

    expect(uploads).toEqual([]);
    expect(disk.files.size).toBe(0);
  });

  it('rejects invalid mode before downloading', async () => {
    const { service } = buildService();

    await expect(
      service.processAudioOverlay({
        audioUrl: 'https://cdn.example.com/speech.wav',
        mixMode: 'invalid' as 'replace',
        videoUrl: 'https://cdn.example.com/video.mp4',
      }),
    ).rejects.toThrow('Invalid mixMode');
    expect(disk.downloads).toEqual([]);
  });
});
