import { execFile, execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';
import { FILES_TMP_ROOT } from '@files/constants/path.constants';
import type { FFmpegService } from '@files/services/ffmpeg/services/ffmpeg.service';
import { WatermarkExportService } from '@files/services/watermark-export/watermark-export.service';
import type { FFprobeData } from '@files/shared/interfaces/ffmpeg.interfaces';
import type { IWatermarkExportRequest } from '@genfeedai/contracts/interfaces';
import type { StorageProvider } from '@genfeedai/storage';
import ffmpegPath from 'ffmpeg-static';
import ffprobeStatic from 'ffprobe-static';
import sharp from 'sharp';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// `ffmpeg-static`/`ffprobe-static` publish a binary path from their package
// even when their postinstall never ran (Bun only runs postinstalls for
// packages listed in the root `trustedDependencies`, which CI does not grant
// to these). Resolve a real, on-disk encoder: the vendored static binary
// when it was actually downloaded, else whatever `ffmpeg`/`ffprobe` the host
// has on PATH (GitHub's ubuntu runners ship both). When neither exists the
// real-render assertions below are skipped rather than failing on ENOENT.
function resolveOnPath(binary: string): string | undefined {
  try {
    execFileSync(binary, ['-version'], { stdio: 'ignore' });
    return binary;
  } catch {
    return undefined;
  }
}

const resolvedFfmpegBinary =
  ffmpegPath && existsSync(ffmpegPath) ? ffmpegPath : resolveOnPath('ffmpeg');
const resolvedFfprobeBinary =
  ffprobeStatic.path && existsSync(ffprobeStatic.path)
    ? ffprobeStatic.path
    : resolveOnPath('ffprobe');

const original = () =>
  sharp({
    create: { width: 400, height: 300, channels: 4, background: '#000000' },
  })
    .png()
    .toBuffer();
const request: IWatermarkExportRequest = {
  category: 'images',
  storageKey: 'ingredients/image/source.png',
  layers: [
    { text: '<Client & preview>', opacity: 0.5, position: 'bottom-right' },
  ],
};

function setup() {
  let exported: Buffer | undefined;
  const storage: StorageProvider = {
    download: vi.fn(async (_key, target) => {
      await writeFile(target, await original());
    }),
    uploadFromFile: vi.fn(async (key, target) => {
      exported = await sharp(target).png().toBuffer();
      return key;
    }),
    upload: vi.fn(),
    delete: vi.fn(),
    list: vi.fn(),
    listObjects: vi.fn(),
    exists: vi.fn(async (key) => key.startsWith('logos/')),
    getUrl: vi.fn((key) => `https://cdn.example/${key}`),
  };
  const ffmpeg = { getVideoMetadata: vi.fn(), executeFFmpegCapture: vi.fn() };
  const service = new WatermarkExportService(
    storage,
    ffmpeg as unknown as FFmpegService,
  );
  return { service, storage, ffmpeg, getExported: () => exported };
}

describe('WatermarkExportService', () => {
  beforeEach(() => vi.clearAllMocks());

  it('renders a separate image with escaped text and leaves source storage untouched', async () => {
    const { service, storage, getExported } = setup();
    const result = await service.render(request);
    expect(result.storageKey).toMatch(/^exports\/watermarked\/.+\.png$/);
    expect(result.storageKey).not.toBe(request.storageKey);
    expect(result.url).toBe(`https://cdn.example/${result.storageKey}`);
    expect(storage.getUrl).toHaveBeenCalledWith(result.storageKey);
    expect(storage.delete).not.toHaveBeenCalled();
    expect(storage.upload).not.toHaveBeenCalled();
    const rendered = await sharp(getExported()).raw().toBuffer();
    const source = await sharp(await original())
      .raw()
      .toBuffer();
    expect(rendered.equals(source)).toBe(false);
    expect(
      rendered
        .subarray(0, 400 * 200 * 4)
        .equals(source.subarray(0, 400 * 200 * 4)),
    ).toBe(true);
  });

  it.each([
    { ...request, storageKey: '../secret' },
    { ...request, layers: [] },
    {
      ...request,
      layers: [{ text: 'preview', position: 'bottom-right', opacity: 0 }],
    },
    {
      ...request,
      layers: [
        { text: 'preview', position: 'bottom-right', opacity: Number.NaN },
      ],
    },
    {
      ...request,
      layers: [
        { logoStorageKey: '../secret', position: 'bottom-right', opacity: 0.5 },
      ],
    },
  ])('rejects invalid inputs before storage access', async (invalidRequest) => {
    const { service, storage } = setup();
    await expect(
      service.render(invalidRequest as IWatermarkExportRequest),
    ).rejects.toThrow();
    expect(storage.download).not.toHaveBeenCalled();
  });

  it('renders a tenant-resolved raster logo with opacity', async () => {
    const { service, storage, getExported } = setup();
    vi.mocked(storage.download).mockImplementation(async (key, target) => {
      const buffer =
        key === 'logos/brand.png'
          ? await sharp({
              create: {
                width: 100,
                height: 50,
                channels: 4,
                background: '#ffffff',
              },
            })
              .png()
              .toBuffer()
          : await original();
      await writeFile(target, buffer);
    });
    await service.render({
      ...request,
      layers: [
        {
          logoStorageKey: 'logos/brand.png',
          opacity: 0.5,
          position: 'top-left',
        },
      ],
    });
    const { data, info } = await sharp(getExported())
      .raw()
      .toBuffer({ resolveWithObject: true });
    expect(data[(15 * info.width + 45) * info.channels]).toBeGreaterThan(120);
    expect(data[(15 * info.width + 45) * info.channels]).toBeLessThan(140);
  });

  it('fails a broken video render without publishing a derivative', async () => {
    const { service, storage, ffmpeg } = setup();
    ffmpeg.getVideoMetadata.mockResolvedValue({
      streams: [{ codec_type: 'video', width: 400, height: 300 }],
    });
    ffmpeg.executeFFmpegCapture.mockResolvedValue({
      code: 1,
      stderr: 'failed',
      stdout: '',
    });
    await expect(
      service.render({ ...request, category: 'videos' }),
    ).rejects.toThrow('rendering failed');
    expect(storage.uploadFromFile).not.toHaveBeenCalled();
    const args = ffmpeg.executeFFmpegCapture.mock.calls[0]?.[0] as string[];
    expect(args).toContain('0:a?');
    expect(args).toContain('libx264');
  });
  it.skipIf(!resolvedFfmpegBinary || !resolvedFfprobeBinary)(
    'renders a real MP4 while retaining duration and audio',
    async () => {
      const binary = resolvedFfmpegBinary as string;
      const probeBinary = resolvedFfprobeBinary as string;
      const execute = promisify(execFile);
      await mkdir(FILES_TMP_ROOT, { recursive: true });
      const fixtureRoot = await mkdtemp(
        path.join(FILES_TMP_ROOT, 'watermark-fixture-'),
      );
      try {
        const input = path.join(fixtureRoot, 'source.mp4');
        await execute(binary, [
          '-hide_banner',
          '-loglevel',
          'error',
          '-f',
          'lavfi',
          '-i',
          'color=c=black:s=400x300:d=0.5',
          '-f',
          'lavfi',
          '-i',
          'sine=frequency=440:duration=0.5',
          '-c:v',
          'libx264',
          '-c:a',
          'aac',
          '-shortest',
          '-y',
          input,
        ]);
        const { storage, ffmpeg } = setup();
        vi.mocked(storage.download).mockImplementation(async (_key, target) => {
          await writeFile(target, await readFile(input));
        });
        const output = path.join(fixtureRoot, 'rendered.mp4');
        vi.mocked(storage.uploadFromFile).mockImplementation(
          async (key, target) => {
            await writeFile(output, await readFile(target));
            return key;
          },
        );
        ffmpeg.getVideoMetadata.mockResolvedValue({
          streams: [{ codec_type: 'video', width: 400, height: 300 }],
        });
        ffmpeg.executeFFmpegCapture.mockImplementation(
          async (args: string[]) => {
            const result = await execute(binary, args);
            return { ...result, code: 0 };
          },
        );
        const service = new WatermarkExportService(
          storage,
          ffmpeg as unknown as FFmpegService,
        );
        await service.render({ ...request, category: 'videos' });
        const probe = await execute(probeBinary, [
          '-v',
          'quiet',
          '-show_streams',
          '-show_format',
          '-of',
          'json',
          output,
        ]);
        const metadata = JSON.parse(probe.stdout) as FFprobeData;
        expect(
          metadata.streams.some((stream) => stream.codec_type === 'audio'),
        ).toBe(true);
        expect(Number(metadata.format.duration)).toBeGreaterThanOrEqual(0.5);
        expect(Number(metadata.format.duration)).toBeLessThan(0.7);
        const frame = path.join(fixtureRoot, 'frame.png');
        await execute(binary, [
          '-hide_banner',
          '-loglevel',
          'error',
          '-i',
          output,
          '-frames:v',
          '1',
          '-y',
          frame,
        ]);
        const pixels = await sharp(frame).removeAlpha().raw().toBuffer();
        expect(pixels.some((value) => value > 50)).toBe(true);
      } finally {
        await rm(fixtureRoot, { recursive: true, force: true });
      }
    },
    30_000,
  );
  it('reuses the rendered content without overwriting an original', async () => {
    const { service, storage } = setup();
    const first = await service.render(request);
    vi.mocked(storage.exists).mockImplementation(
      async (key) => key === first.storageKey,
    );
    const cached = await service.render(request);
    expect(cached).toEqual(first);
    expect(storage.uploadFromFile).toHaveBeenCalledTimes(1);
    const changed = await service.render({
      ...request,
      layers: [
        { text: 'Different client', opacity: 0.5, position: 'bottom-right' },
      ],
    });
    expect(changed.storageKey).not.toBe(first.storageKey);
    expect(storage.uploadFromFile).toHaveBeenCalledTimes(2);
  });

  it('limits concurrent rendering and releases capacity on failure', async () => {
    const { service, storage } = setup();
    vi.mocked(storage.download).mockRejectedValue(
      new Error('Storage unavailable'),
    );
    const first = service.render(request);
    const second = service.render(request);
    await expect(service.render(request)).rejects.toMatchObject({
      status: 429,
    });
    await Promise.allSettled([first, second]);
    vi.mocked(storage.download).mockImplementation(async (_key, target) => {
      await writeFile(target, await original());
    });
    await expect(service.render(request)).resolves.toHaveProperty('url');
  });
});
