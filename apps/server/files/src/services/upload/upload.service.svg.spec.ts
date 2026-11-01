import { ConfigService } from '@files/config/config.service';
import type { FFmpegService } from '@files/services/ffmpeg/services/ffmpeg.service';
import type { FileRuntimeSettingsService } from '@files/services/runtime-settings/file-runtime-settings.service';
import { UploadService } from '@files/services/upload/upload.service';
import type { StorageProvider } from '@genfeedai/storage';
import type { LoggerService } from '@libs/logger/logger.service';
import { safeFetch } from '@libs/security/destination-guard';
import sharp from 'sharp';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@libs/security/destination-guard', async (importOriginal) => ({
  ...(await importOriginal<
    typeof import('@libs/security/destination-guard')
  >()),
  safeFetch: vi.fn(),
}));

// Real sharp on purpose: the behavior under test is the rasterized output.
const LOGO_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="100" height="50" viewBox="0 0 100 50"><circle cx="25" cy="25" r="20" fill="#ff0000"/></svg>`;
const HUGE_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="10000" height="5000" viewBox="0 0 10000 5000"><rect width="10000" height="5000" fill="#0000ff"/></svg>`;

interface StoredObject {
  body: Buffer;
  contentType: string;
}

describe('UploadService SVG uploads', () => {
  let stored: StoredObject[];
  let service: UploadService;

  beforeEach(() => {
    stored = [];
    const storage = {
      getUrl: (key: string) => `https://cdn.example.com/${key}`,
      upload: async (body: Buffer, key: string, contentType: string) => {
        stored.push({ body, contentType });
        return key;
      },
    } as unknown as StorageProvider;

    service = new UploadService(
      {
        get: async () => ({ imageCompressionQuality: 80 }),
      } as unknown as FileRuntimeSettingsService,
      { get: () => undefined } as unknown as ConfigService,
      {} as FFmpegService,
      {
        error: vi.fn(),
        log: vi.fn(),
        warn: vi.fn(),
      } as unknown as LoggerService,
      storage,
    );
  });

  it('stores an SVG buffer as a transparent PNG', async () => {
    const result = await service.uploadToS3('asset-1', 'logos', {
      contentType: 'image/svg+xml',
      data: Buffer.from(LOGO_SVG),
      type: 'buffer',
    });

    const [object] = stored;
    const metadata = await sharp(object.body).metadata();
    expect(object.contentType).toBe('image/png');
    expect(metadata.format).toBe('png');
    expect(metadata.hasAlpha).toBe(true);
    expect([metadata.width, metadata.height]).toEqual([400, 200]);
    expect([result.width, result.height]).toEqual([400, 200]);
  });

  it('keeps the logo shape instead of flattening it onto a background', async () => {
    await service.uploadToS3('asset-1', 'logos', {
      contentType: 'image/svg+xml',
      data: Buffer.from(LOGO_SVG),
      type: 'buffer',
    });

    const { data, info } = await sharp(stored[0].body)
      .raw()
      .ensureAlpha()
      .toBuffer({ resolveWithObject: true });
    const pixelAt = (x: number, y: number) => {
      const offset = (y * info.width + x) * info.channels;
      return Array.from(data.subarray(offset, offset + 4));
    };

    expect(pixelAt(100, 100)).toEqual([255, 0, 0, 255]);
    expect(pixelAt(390, 10)[3]).toBe(0);
  });

  it('caps the width of a very large SVG', async () => {
    const result = await service.uploadToS3('asset-2', 'logos', {
      contentType: 'image/svg+xml',
      data: Buffer.from(HUGE_SVG),
      type: 'buffer',
    });

    expect([result.width, result.height]).toEqual([2048, 1024]);
  });

  it('rejects malformed SVG markup', async () => {
    await expect(
      service.uploadToS3('asset-3', 'logos', {
        contentType: 'image/svg+xml',
        data: Buffer.from('<svg><not closed'),
        type: 'buffer',
      }),
    ).rejects.toThrow();
    expect(stored).toEqual([]);
  });

  it('treats a downloaded .svg URL as an SVG even without a content type', async () => {
    vi.mocked(safeFetch).mockResolvedValue(
      new Response(Buffer.from(LOGO_SVG), { status: 200 }),
    );

    await service.uploadToS3('asset-4', 'logos', {
      type: 'url',
      url: 'https://example.com/assets/logo.svg',
    });

    expect(stored[0].contentType).toBe('image/png');
  });
});
