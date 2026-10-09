import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import * as fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import type { FFmpegCoreService } from '@files/services/ffmpeg/services/ffmpeg-core.service';
import { FFmpegMergeService } from '@files/services/ffmpeg/services/ffmpeg-merge.service';
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

describeRealFFmpeg('real FFmpeg transition merging', () => {
  let directory: string;
  let clips: string[];
  let service: FFmpegMergeService;

  beforeEach(async () => {
    directory = await fs.mkdtemp(
      path.join(os.tmpdir(), 'genfeed-transition-fixture-'),
    );
    clips = [];
    const fixtures = [
      { fps: 24, size: '64x48', color: 'red', audio: true },
      { fps: 30, size: '48x64', color: 'blue', audio: false },
      { fps: 25, size: '64x48', color: 'green', audio: true },
    ];
    for (const [index, fixture] of fixtures.entries()) {
      const file = path.join(directory, `clip-${index}.mp4`);
      encode([
        '-f',
        'lavfi',
        '-i',
        `color=c=${fixture.color}:s=${fixture.size}:r=${fixture.fps}:d=2`,
        ...(fixture.audio
          ? [
              '-f',
              'lavfi',
              '-i',
              'sine=frequency=440:sample_rate=48000:duration=2',
            ]
          : []),
        '-c:v',
        'libx264',
        '-pix_fmt',
        'yuv420p',
        ...(fixture.audio ? ['-c:a', 'aac'] : []),
        '-y',
        file,
      ]);
      clips.push(file);
    }
    service = new FFmpegMergeService(
      {
        probe: async (file: string) => probe(file),
        executeFFmpeg: async (args: string[]) => encode(args),
      } as unknown as FFmpegCoreService,
      {
        debug: vi.fn(),
      } as unknown as LoggerService,
    );
  });

  afterEach(async () => {
    if (directory) await fs.rm(directory, { recursive: true, force: true });
  });

  it.each([
    { count: 2, duration: 3.5, muted: false },
    { count: 3, duration: 5, muted: false },
    { count: 2, duration: 3.5, muted: true },
  ])(
    'merges $count mixed-rate clips with muted=$muted',
    async ({ count, duration, muted }) => {
      const output = path.join(directory, 'merged.mp4');
      await service.mergeVideosWithTransitions(clips.slice(0, count), output, {
        transition: 'fade',
        transitionDuration: 0.5,
        muteVideoAudio: muted,
      });
      const metadata = probe(output);
      const video = metadata.streams.find(
        (stream) => stream.codec_type === 'video',
      );
      expect(video).toMatchObject({
        width: 64,
        height: 48,
        r_frame_rate: '30/1',
      });
      expect(Number(metadata.format?.duration)).toBeCloseTo(duration, 1);
      expect(
        metadata.streams.some((stream) => stream.codec_type === 'audio'),
      ).toBe(!muted);
      encode(['-i', output, '-f', 'null', '-']);
    },
  );
});
