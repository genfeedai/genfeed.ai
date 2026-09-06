import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import * as fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { SpeechAssemblyService } from '@files/services/audio-overlay/speech-assembly.service';
import { buildAudioOverlayArgs } from '@files/services/ffmpeg/helpers/audio-overlay-args.helper';
import type { FFprobeData } from '@files/shared/interfaces/ffmpeg.interfaces';
import ffmpegStaticPath from 'ffmpeg-static';
import ffprobeStatic from 'ffprobe-static';

vi.mock('@files/services/ffmpeg/services/ffmpeg.service', () => ({
  FFmpegService: class {},
}));
vi.mock('@files/services/upload/upload.service', () => ({
  UploadService: class {},
}));
const localMedia = vi.hoisted(() => new Map<string, Buffer>());
vi.mock('@files/services/audio-overlay/media-download', () => ({
  downloadPublicMedia: async (url: string) => {
    const data = localMedia.get(url);
    if (!data) throw new Error('Unknown fixture URL');
    return data;
  },
}));

/**
 * `ffmpeg-static` / `ffprobe-static` only produce a real binary when their
 * npm postinstall ran, which needs the package listed in Bun's
 * `trustedDependencies`. CI does not grant that, so fall back to a PATH
 * binary (GitHub's ubuntu runners ship ffmpeg/ffprobe) and skip this real
 * FFmpeg suite entirely when neither is available.
 */
function resolveExecutableOnPath(binary: string): string | null {
  try {
    execFileSync(binary, ['-version'], {
      stdio: 'ignore',
      timeout: 5_000,
    });
    return binary;
  } catch {
    return null;
  }
}
function resolveBinary(
  staticPath: string | null,
  binary: string,
): string | null {
  if (staticPath && existsSync(staticPath)) return staticPath;
  return resolveExecutableOnPath(binary);
}

const resolvedFfmpegPath = resolveBinary(ffmpegStaticPath, 'ffmpeg');
const resolvedFfprobePath = resolveBinary(ffprobeStatic.path, 'ffprobe');
const describeRealFFmpeg =
  resolvedFfmpegPath && resolvedFfprobePath ? describe : describe.skip;

function encode(args: string[]): Buffer {
  if (!resolvedFfmpegPath) throw new Error('ffmpeg binary is unavailable');
  return execFileSync(
    resolvedFfmpegPath,
    ['-hide_banner', '-loglevel', 'error', ...args],
    { timeout: 20_000, maxBuffer: 4 * 1024 * 1024 },
  );
}
function probe(file: string): FFprobeData {
  if (!resolvedFfprobePath) throw new Error('ffprobe binary is unavailable');
  return JSON.parse(
    execFileSync(
      resolvedFfprobePath,
      ['-v', 'error', '-show_streams', '-show_format', '-of', 'json', file],
      { timeout: 10_000, encoding: 'utf8' },
    ),
  ) as FFprobeData;
}
function rms(pcm: Buffer, start: number, end: number): number {
  let energy = 0;
  const first = Math.round(start * 48000);
  const last = Math.round(end * 48000);
  for (let index = first; index < last; index++)
    energy += pcm.readFloatLE(index * 4) ** 2;
  return Math.sqrt(energy / (last - first));
}
function crossings(pcm: Buffer, start: number, end: number): number {
  let count = 0;
  for (
    let index = Math.round(start * 48000) + 1;
    index < Math.round(end * 48000);
    index++
  ) {
    if (pcm.readFloatLE((index - 1) * 4) < 0 && pcm.readFloatLE(index * 4) >= 0)
      count++;
  }
  return count;
}

describeRealFFmpeg(
  'real FFmpeg speech assembly and soundtrack composition',
  () => {
    let dir: string;
    let service: SpeechAssemblyService;
    let output: string;
    beforeEach(async () => {
      dir = await fs.mkdtemp(path.join(os.tmpdir(), 'genfeed-speech-fixture-'));
      output = path.join(dir, 'assembled.wav');
      localMedia.clear();
      for (const frequency of [440, 880]) {
        const file = path.join(dir, `tone-${frequency}.wav`);
        encode([
          '-f',
          'lavfi',
          '-i',
          `sine=frequency=${frequency}:sample_rate=48000:duration=0.25`,
          '-c:a',
          'pcm_s16le',
          '-y',
          file,
        ]);
        localMedia.set(
          `https://fixture.example/${frequency}.wav`,
          await fs.readFile(file),
        );
      }
      service = new SpeechAssemblyService(
        {
          getTempPath: () => dir,
          probe: async (file: string) => probe(file),
          executeFFmpegCapture: async (args: string[]) => {
            encode(args);
            return { code: 0, stdout: '', stderr: '' };
          },
        } as never,
        {
          uploadToS3: async (
            _key: string,
            _type: string,
            source: { path: string },
          ) => {
            await fs.copyFile(source.path, output);
            return { publicUrl: 'https://fixture.example/assembled.wav' };
          },
        } as never,
      );
    });
    afterEach(async () => {
      await fs.rm(dir, { recursive: true, force: true });
    });

    it('encodes the full duration with ordered speech and actual silent gaps', async () => {
      await service.assemble({
        durationSeconds: 3,
        segments: [
          {
            audioUrl: 'https://fixture.example/440.wav',
            startSeconds: 0.25,
            endSeconds: 0.75,
          },
          {
            audioUrl: 'https://fixture.example/880.wav',
            startSeconds: 1.5,
            endSeconds: 2,
          },
        ],
      });
      expect(Number(probe(output).format.duration)).toBeCloseTo(3, 2);
      const pcm = encode([
        '-i',
        output,
        '-f',
        'f32le',
        '-ar',
        '48000',
        '-ac',
        '1',
        'pipe:1',
      ]);
      expect(rms(pcm, 0, 0.2)).toBeLessThan(0.00001);
      expect(rms(pcm, 0.3, 0.45)).toBeGreaterThan(0.04);
      expect(rms(pcm, 0.9, 1.3)).toBeLessThan(0.00001);
      expect(rms(pcm, 1.55, 1.7)).toBeGreaterThan(0.04);
      expect(rms(pcm, 2, 2.9)).toBeLessThan(0.00001);
      expect(crossings(pcm, 1.55, 1.7) / crossings(pcm, 0.3, 0.45)).toBeCloseTo(
        2,
        1,
      );
    });
    it('rejects an actual measured overrun without producing an assembled file', async () => {
      await expect(
        service.assemble({
          durationSeconds: 3,
          segments: [
            {
              audioUrl: 'https://fixture.example/440.wav',
              startSeconds: 0,
              endSeconds: 0.1,
            },
          ],
        }),
      ).rejects.toThrow('exceeds its time window');
      await expect(fs.access(output)).rejects.toThrow();
    });
    it('limits summed peaks while retaining user gains below clipping', () => {
      const video = path.join(dir, 'loud-source.mp4');
      encode([
        '-f',
        'lavfi',
        '-i',
        'color=c=blue:s=64x64:r=10:d=1',
        '-f',
        'lavfi',
        '-i',
        'sine=frequency=440:sample_rate=48000:duration=1',
        '-af',
        'volume=6',
        '-c:v',
        'mpeg4',
        '-c:a',
        'aac',
        '-t',
        '1',
        '-y',
        video,
      ]);
      const audio = path.join(dir, 'loud.wav');
      encode([
        '-f',
        'lavfi',
        '-i',
        'sine=frequency=440:sample_rate=48000:duration=1',
        '-af',
        'volume=6',
        '-y',
        audio,
      ]);
      const rendered = path.join(dir, 'limited.mp4');
      encode(
        buildAudioOverlayArgs({
          videoPath: video,
          audioPath: audio,
          outputPath: rendered,
          mixMode: 'mix',
          audioVolume: 1,
          videoVolume: 1,
          fadeIn: 0,
          fadeOut: 0,
          durationSeconds: 1,
          hasVideoAudio: true,
        }),
      );
      const pcm = encode([
        '-i',
        rendered,
        '-f',
        'f32le',
        '-ar',
        '48000',
        '-ac',
        '1',
        'pipe:1',
      ]);
      let peak = 0;
      for (let offset = 0; offset < pcm.length; offset += 4)
        peak = Math.max(peak, Math.abs(pcm.readFloatLE(offset)));
      expect(peak).toBeLessThan(1);
      expect(rms(pcm, 0.2, 0.8)).toBeGreaterThan(0.45);
      const quiet = path.join(dir, 'quiet.mp4');
      encode(
        buildAudioOverlayArgs({
          videoPath: video,
          audioPath: audio,
          outputPath: quiet,
          mixMode: 'mix',
          audioVolume: 0.2,
          videoVolume: 0.2,
          fadeIn: 0,
          fadeOut: 0,
          durationSeconds: 1,
          hasVideoAudio: true,
        }),
      );
      const quietPcm = encode([
        '-i',
        quiet,
        '-f',
        'f32le',
        '-ar',
        '48000',
        '-ac',
        '1',
        'pipe:1',
      ]);
      expect(rms(quietPcm, 0.2, 0.8)).toBeGreaterThan(0.18);
      expect(rms(quietPcm, 0.2, 0.8)).toBeLessThan(0.25);
    });
    it.each(['replace', 'mix', 'background'] as const)(
      'preserves video duration when %s uses a much shorter soundtrack',
      (mixMode) => {
        const video = path.join(dir, 'original.mp4');
        encode([
          '-f',
          'lavfi',
          '-i',
          'color=c=blue:s=64x64:r=10:d=3',
          '-f',
          'lavfi',
          '-i',
          'sine=frequency=220:duration=3',
          '-c:v',
          'mpeg4',
          '-c:a',
          'aac',
          '-t',
          '3',
          '-y',
          video,
        ]);
        const rendered = path.join(dir, `${mixMode}.mp4`);
        encode(
          buildAudioOverlayArgs({
            videoPath: video,
            audioPath: path.join(dir, 'tone-440.wav'),
            outputPath: rendered,
            mixMode,
            audioVolume: 0.5,
            videoVolume: 0.5,
            fadeIn: 0.05,
            fadeOut: 0.2,
            durationSeconds: 3,
            hasVideoAudio: true,
          }),
        );
        const metadata = probe(rendered);
        expect(Number(metadata.format.duration)).toBeCloseTo(3, 1);
        expect(
          metadata.streams.some((stream) => stream.codec_type === 'audio'),
        ).toBe(true);
        expect(
          metadata.streams.some((stream) => stream.codec_type === 'video'),
        ).toBe(true);
      },
    );
  },
);
