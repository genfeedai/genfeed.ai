import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import * as fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import type { FFmpegCoreService } from '@files/services/ffmpeg/services/ffmpeg-core.service';
import { FFmpegMergeService } from '@files/services/ffmpeg/services/ffmpeg-merge.service';
import type { FFprobeData } from '@files/shared/interfaces/ffmpeg.interfaces';
import { VideoTransition } from '@genfeedai/contracts';
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

const TRANSITIONS = Object.values(VideoTransition).filter(
  (transition) => transition !== VideoTransition.NONE,
);

interface ClipFixture {
  audioSeconds?: number;
  color: string;
  fps: number | string;
  seconds: number;
  size: string;
}

function encodeClip(file: string, fixture: ClipFixture): void {
  encode([
    '-f',
    'lavfi',
    '-i',
    `color=c=${fixture.color}:s=${fixture.size}:r=${fixture.fps}:d=${fixture.seconds}`,
    ...(fixture.audioSeconds
      ? [
          '-f',
          'lavfi',
          '-i',
          `sine=frequency=440:sample_rate=44100:duration=${fixture.audioSeconds}`,
        ]
      : []),
    '-c:v',
    'libx264',
    '-preset',
    'ultrafast',
    '-pix_fmt',
    'yuv420p',
    ...(fixture.audioSeconds ? ['-c:a', 'aac'] : []),
    '-y',
    file,
  ]);
}

function streamDuration(metadata: FFprobeData, type: 'audio' | 'video') {
  return Number(
    metadata.streams.find((stream) => stream.codec_type === type)?.duration,
  );
}

describeRealFFmpeg('real FFmpeg transition merging', () => {
  let directory: string;
  let clips: string[];
  let service: FFmpegMergeService;

  async function fixture(name: string, clip: ClipFixture): Promise<string> {
    const file = path.join(directory, `${name}.mp4`);
    encodeClip(file, clip);
    return file;
  }

  beforeEach(async () => {
    directory = await fs.mkdtemp(
      path.join(os.tmpdir(), 'genfeed-transition-fixture-'),
    );
    // Mixed frame rates (including NTSC), sizes and audio presence, the way
    // clips from different providers arrive.
    clips = [
      await fixture('clip-0', {
        audioSeconds: 2.5,
        color: 'red',
        fps: 24,
        seconds: 2.5,
        size: '64x48',
      }),
      await fixture('clip-1', {
        color: 'blue',
        fps: 30,
        seconds: 2.5,
        size: '48x64',
      }),
      await fixture('clip-2', {
        audioSeconds: 2.5,
        color: 'green',
        fps: '30000/1001',
        seconds: 2.5,
        size: '64x48',
      }),
    ];
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
    { count: 2, duration: 4.5, muted: false },
    { count: 3, duration: 6.5, muted: false },
    { count: 2, duration: 4.5, muted: true },
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
        pix_fmt: 'yuv420p',
      });
      expect(Number(metadata.format?.duration)).toBeCloseTo(duration, 1);
      expect(
        metadata.streams.some((stream) => stream.codec_type === 'audio'),
      ).toBe(!muted);
      encode(['-i', output, '-f', 'null', '-']);
    },
  );

  describe.each(TRANSITIONS)('%s', (transition) => {
    it.each([0.1, 0.5, 2])(
      'joins 24 fps and 30 fps clips with a %ss overlap',
      async (transitionDuration) => {
        const output = path.join(directory, `${transition}.mp4`);
        await service.mergeVideosWithTransitions(clips.slice(0, 2), output, {
          transition,
          transitionDuration,
        });
        const metadata = probe(output);
        const expected = 2.5 * 2 - transitionDuration;
        expect(streamDuration(metadata, 'video')).toBeCloseTo(expected, 1);
        expect(streamDuration(metadata, 'audio')).toBeCloseTo(expected, 1);
        expect(
          metadata.streams.find((stream) => stream.codec_type === 'video'),
        ).toMatchObject({ pix_fmt: 'yuv420p', r_frame_rate: '30/1' });
      },
    );
  });

  it('places the transition by video length when a clip has longer audio', async () => {
    const longAudio = await fixture('clip-long-audio', {
      audioSeconds: 4,
      color: 'yellow',
      fps: 25,
      seconds: 2,
      size: '64x48',
    });
    const output = path.join(directory, 'long-audio.mp4');
    await service.mergeVideosWithTransitions([longAudio, clips[0]], output, {
      transition: 'wipeleft',
      transitionDuration: 0.5,
    });
    const metadata = probe(output);
    // 2s of video + 2.5s clip − 0.5s overlap; the extra audio is trimmed.
    expect(streamDuration(metadata, 'video')).toBeCloseTo(4, 1);
    expect(streamDuration(metadata, 'audio')).toBeCloseTo(4, 1);
  });

  it('pads a short audio track so later clips stay in sync', async () => {
    const shortAudio = await fixture('clip-short-audio', {
      audioSeconds: 0.5,
      color: 'white',
      fps: 25,
      seconds: 2,
      size: '64x48',
    });
    const output = path.join(directory, 'short-audio.mp4');
    await service.mergeVideosWithTransitions(
      [clips[0], shortAudio, clips[2]],
      output,
      { transition: 'slideleft', transitionDuration: 0.5 },
    );
    const metadata = probe(output);
    expect(streamDuration(metadata, 'video')).toBeCloseTo(6, 1);
    expect(streamDuration(metadata, 'audio')).toBeCloseTo(6, 1);
  });

  it('rejects a transition as long as a clip before running FFmpeg', async () => {
    const output = path.join(directory, 'too-long.mp4');
    await expect(
      service.mergeVideosWithTransitions(clips.slice(0, 2), output, {
        transition: 'fade',
        transitionDuration: 2.5,
      }),
    ).rejects.toThrow('must be shorter than every clip');
  });
});
