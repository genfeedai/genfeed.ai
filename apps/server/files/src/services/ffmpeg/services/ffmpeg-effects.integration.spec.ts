import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import * as fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import type { FFmpegCoreService } from '@files/services/ffmpeg/services/ffmpeg-core.service';
import { FFmpegEffectsService } from '@files/services/ffmpeg/services/ffmpeg-effects.service';
import type { FFprobeData } from '@files/shared/interfaces/ffmpeg.interfaces';
import type { LoggerService } from '@libs/logger/logger.service';
import ffmpegStaticPath from 'ffmpeg-static';
import ffprobeStatic from 'ffprobe-static';

function resolveBinary(
  staticPath: string | null,
  fallback: string,
): string | null {
  for (const candidate of [staticPath, fallback]) {
    if (!candidate || (candidate !== fallback && !existsSync(candidate)))
      continue;
    try {
      execFileSync(candidate, ['-version'], {
        stdio: 'ignore',
        timeout: 5_000,
      });
      return candidate;
    } catch {
      // Try the PATH binary when the bundled binary is unavailable.
    }
  }
  return null;
}

const ffmpeg = resolveBinary(ffmpegStaticPath, 'ffmpeg');
const ffprobe = resolveBinary(ffprobeStatic.path, 'ffprobe');
const describeRealFFmpeg = ffmpeg && ffprobe ? describe : describe.skip;

function encode(args: string[]): void {
  if (!ffmpeg) throw new Error('ffmpeg binary is unavailable');
  execFileSync(ffmpeg, ['-hide_banner', '-loglevel', 'error', ...args], {
    timeout: 20_000,
    maxBuffer: 4 * 1024 * 1024,
  });
}

function probe(file: string): FFprobeData {
  if (!ffprobe) throw new Error('ffprobe binary is unavailable');
  return JSON.parse(
    execFileSync(
      ffprobe,
      ['-v', 'error', '-show_streams', '-show_format', '-of', 'json', file],
      { timeout: 10_000, encoding: 'utf8' },
    ),
  ) as FFprobeData;
}

/** Red, green, blue of the middle of the first frame. */
function centerPixel(file: string): [number, number, number] {
  if (!ffmpeg) throw new Error('ffmpeg binary is unavailable');
  const raw = execFileSync(
    ffmpeg,
    [
      '-hide_banner',
      '-loglevel',
      'error',
      '-i',
      file,
      '-frames:v',
      '1',
      '-vf',
      'format=rgb24,crop=1:1:iw/2:ih/2',
      '-f',
      'rawvideo',
      '-pix_fmt',
      'rgb24',
      '-',
    ],
    { timeout: 10_000, maxBuffer: 1024 },
  );
  return [raw[0], raw[1], raw[2]];
}

/** A two-point cube that sends red to blue and blue to red. */
const SWAP_RED_BLUE_CUBE = [
  'TITLE "swap red and blue"',
  'LUT_3D_SIZE 2',
  ...[0, 1].flatMap((blue) =>
    [0, 1].flatMap((green) =>
      [0, 1].map((red) => `${blue}.0 ${green}.0 ${red}.0`),
    ),
  ),
].join('\n');

describeRealFFmpeg('real FFmpeg colour LUT', () => {
  let directory: string;
  let clip: string;
  let service: FFmpegEffectsService;

  beforeEach(async () => {
    directory = await fs.mkdtemp(path.join(os.tmpdir(), 'genfeed-lut-'));
    clip = path.join(directory, 'clip.mp4');
    encode([
      '-f',
      'lavfi',
      '-i',
      'color=c=red:s=64x48:r=24:d=1',
      '-f',
      'lavfi',
      '-i',
      'sine=frequency=440:sample_rate=44100:duration=1',
      '-c:v',
      'libx264',
      '-preset',
      'ultrafast',
      '-pix_fmt',
      'yuv420p',
      '-c:a',
      'aac',
      '-y',
      clip,
    ]);
    service = new FFmpegEffectsService(
      {
        ensureOutputDir: async (file: string) => {
          await fs.mkdir(path.dirname(file), { recursive: true });
        },
        executeFFmpeg: async (args: string[]) => encode(args),
      } as unknown as FFmpegCoreService,
      { debug: vi.fn() } as unknown as LoggerService,
    );
  });

  afterEach(async () => {
    if (directory) await fs.rm(directory, { force: true, recursive: true });
  });

  it('grades the picture with the cube and keeps the audio', async () => {
    const lut = path.join(directory, 'brand-lut.cube');
    await fs.writeFile(lut, SWAP_RED_BLUE_CUBE);
    const graded = path.join(directory, 'graded.mp4');

    await service.applyColorLut(clip, lut, graded);

    const [ungradedRed, , ungradedBlue] = centerPixel(clip);
    expect(ungradedRed).toBeGreaterThan(200);
    expect(ungradedBlue).toBeLessThan(60);
    const [gradedRed, , gradedBlue] = centerPixel(graded);
    expect(gradedBlue).toBeGreaterThan(200);
    expect(gradedRed).toBeLessThan(60);

    const metadata = probe(graded);
    expect(
      metadata.streams.find((stream) => stream.codec_type === 'video'),
    ).toMatchObject({ height: 48, pix_fmt: 'yuv420p', width: 64 });
    expect(
      metadata.streams.some((stream) => stream.codec_type === 'audio'),
    ).toBe(true);
  });

  it('refuses a LUT path that would reach into the filtergraph', async () => {
    const lut = path.join(directory, "brand lut',x.cube");
    await fs.writeFile(lut, SWAP_RED_BLUE_CUBE);

    await expect(
      service.applyColorLut(clip, lut, path.join(directory, 'graded.mp4')),
    ).rejects.toThrow();
  });
});
