import type { FFmpegService } from '@files/services/ffmpeg/services/ffmpeg.service';
import type { FilesCaptionsService } from '@files/services/files/captions/files-captions.service';
import type { FilesService } from '@files/services/files/files.service';
import { FilesKenBurnsEffectService } from '@files/services/files/ken-burns/files-ken-burns-effect.service';
import type {
  SlideText,
  Word,
} from '@files/shared/interfaces/caption.interface';
import type { LoggerService } from '@libs/logger/logger.service';
import { beforeEach, describe, expect, it, vi } from 'vitest';

/** The working directory on disk: path → file contents. */
const disk = vi.hoisted(() => {
  const files = new Map<string, string>();
  const fs = {
    existsSync: (path: string) => files.has(path),
    readdirSync: (dir: string) =>
      [...files.keys()]
        .filter((path) => path.startsWith(`${dir}/`))
        .map((path) => path.slice(dir.length + 1)),
    readFileSync: (path: string) => {
      const contents = files.get(path);
      if (contents === undefined) throw new Error(`ENOENT: ${path}`);
      return contents;
    },
  };
  return { files, fs };
});
vi.mock('fs', () => ({ ...disk.fs, default: disk.fs }));
vi.mock('node:fs', () => ({ ...disk.fs, default: disk.fs }));

type Render = Record<string, unknown>;

const ID = 'ingredient-1';
const dimensions = { height: 1920, width: 1080 };
const slideText: SlideText[] = [
  { duration: 3, overlayText: 'A', voiceText: 'hello' },
  { duration: 2, overlayText: 'B', voiceText: 'world' },
];

describe('FilesKenBurnsEffectService', () => {
  let renders: Map<string, Render>;
  let failingStep: string | undefined;
  let service: FilesKenBurnsEffectService;

  const apply = (
    options?: Parameters<FilesKenBurnsEffectService['applyKenBurnsEffect']>[3],
  ) =>
    service.applyKenBurnsEffect(
      'https://example.com/image.jpg',
      3,
      ID,
      options,
    );
  const seedImages = (...names: string[]) => {
    for (const name of names)
      disk.files.set(`/tmp/images-${ID}/${name}`, 'jpeg');
  };

  beforeEach(() => {
    disk.files.clear();
    renders = new Map();
    failingStep = undefined;
    seedImages('1.jpeg', '2.jpeg');

    // FFmpeg renders into the studio; each output records what made it.
    const render = (step: string, output: string, made: Render) => {
      if (failingStep === step) throw new Error(`${step} failed`);
      renders.set(output, { step, ...made });
    };
    const ffmpeg = {
      addComplexAudioMix: async (
        input: string,
        output: string,
        { filters, musicPath, voicePaths }: Render,
      ) => render('audio', output, { filters, input, musicPath, voicePaths }),
      createKenBurnsVideoWithTransitions: async (
        slides: string[],
        output: string,
        { totalDuration }: Render,
      ) => {
        const missing = slides.filter((slide) => !renders.has(slide));
        if (missing.length > 0) throw new Error(`Missing ${missing.join()}`);
        render('merge', output, { slides, totalDuration });
      },
      generateKenBurnsSlide: async (
        input: string,
        output: string,
        { dimensions: size, duration, zoomDirection }: Render,
      ) => render('slide', output, { duration, input, size, zoomDirection }),
    };
    const files = {
      addWatermark: async (path: string) => {
        const output = path.replace('.mp4', '_watermark.mp4');
        render('watermark', output, { input: path });
        return output;
      },
      getPath: (type: string, id: string) => `/tmp/${type}-${id}`,
      getSortedFiles: (dir: string, extension: string) =>
        disk.fs
          .readdirSync(dir)
          .filter((name) => name.endsWith(`.${extension}`))
          .sort(),
    };
    // Captions: an srt line reads "start-end text".
    const captions = {
      filterCaptions: (srt: string): Word[] =>
        srt.split('\n').map((line) => {
          const [range = '', text = ''] = line.split(' ');
          const [start, end] = range.split('-').map(Number);
          return { end: end ?? 0, start: start ?? 0, text };
        }),
      getDrawtextFilters: (_font: string, words: Word[]) =>
        words.map((word) => `caption ${word.text} ${word.start}-${word.end}`),
      getOverlayDrawtextFilters: (font: string, slides: SlideText[]) =>
        slides.map((slide) => `overlay ${slide.overlayText} in ${font}`),
    };

    service = new FilesKenBurnsEffectService(
      {
        error: () => undefined,
        log: () => undefined,
      } as unknown as LoggerService,
      ffmpeg as unknown as FFmpegService,
      files as unknown as FilesService,
      captions as unknown as FilesCaptionsService,
    );
  });

  it('renders a zooming slide per image, merges them and mixes in the audio', async () => {
    await expect(apply({ dimensions, slideText })).resolves.toBe(
      `/tmp/output-${ID}/final.mp4`,
    );

    expect(Object.fromEntries(renders)).toEqual({
      [`/tmp/output-${ID}/${ID}_temp.mp4`]: {
        slides: [
          `/tmp/slides-${ID}/frame_0.mp4`,
          `/tmp/slides-${ID}/frame_1.mp4`,
        ],
        step: 'merge',
        totalDuration: 4.7,
      },
      [`/tmp/output-${ID}/final.mp4`]: {
        filters: [
          'overlay A in montserrat-black',
          'overlay B in montserrat-black',
        ],
        input: `/tmp/output-${ID}/${ID}_temp.mp4`,
        musicPath: `/tmp/musics-${ID}/frame-0.mp3`,
        step: 'audio',
        voicePaths: [],
      },
      [`/tmp/slides-${ID}/frame_0.mp4`]: {
        duration: 3,
        input: `/tmp/images-${ID}/1.jpeg`,
        size: dimensions,
        step: 'slide',
        zoomDirection: "x='0':y='ih/2'",
      },
      [`/tmp/slides-${ID}/frame_1.mp4`]: {
        duration: 2,
        input: `/tmp/images-${ID}/2.jpeg`,
        size: dimensions,
        step: 'slide',
        zoomDirection: "x='iw/2':y='0'",
      },
    });
  });

  it('mixes voices in numeric order with captions offset by slide', async () => {
    disk.files.set(`/tmp/voices-${ID}/frame-10.mp3`, 'mp3');
    disk.files.set(`/tmp/voices-${ID}/frame-2.mp3`, 'mp3');
    disk.files.set(`/tmp/voices-${ID}/frame-2.srt`, '0-900 Hi');
    disk.files.set(`/tmp/voices-${ID}/frame-10.srt`, '100-600 there');
    disk.files.set(`/tmp/voices-${ID}/notes.txt`, 'ignore me');

    await apply({ dimensions, slideText });

    expect(renders.get(`/tmp/output-${ID}/final.mp4`)).toMatchObject({
      filters: [
        'caption Hi 0-900',
        'caption there 3100-3600',
        'overlay A in montserrat-black',
        'overlay B in montserrat-black',
      ],
      voicePaths: [
        `/tmp/voices-${ID}/frame-2.mp3`,
        `/tmp/voices-${ID}/frame-10.mp3`,
      ],
    });
  });

  it('skips captions for a voice without subtitles', async () => {
    disk.files.set(`/tmp/voices-${ID}/frame-0.mp3`, 'mp3');

    await apply({ dimensions, slideText });

    expect(renders.get(`/tmp/output-${ID}/final.mp4`)).toMatchObject({
      filters: [
        'overlay A in montserrat-black',
        'overlay B in montserrat-black',
      ],
      voicePaths: [`/tmp/voices-${ID}/frame-0.mp3`],
    });
  });

  it('uses one portrait slide of the requested length by default', async () => {
    disk.files.clear();
    seedImages('1.jpeg');

    await apply();

    expect(renders.get(`/tmp/slides-${ID}/frame_0.mp4`)).toMatchObject({
      duration: 3,
      size: { height: 1920, width: 1080 },
    });
    expect(renders.get(`/tmp/output-${ID}/${ID}_temp.mp4`)).toMatchObject({
      totalDuration: 3,
    });
  });

  it.each([
    [{ isClipSelected: true }, `/tmp/clips-${ID}/final.mp4`],
    [{ isWatermarkEnabled: true }, `/tmp/output-${ID}/final_watermark.mp4`],
    [{ fontFamily: 'inter' }, `/tmp/output-${ID}/final.mp4`],
  ])('delivers the final video for %o', async (options, expected) => {
    await expect(apply({ dimensions, slideText, ...options })).resolves.toBe(
      expected,
    );
    expect(renders.has(expected)).toBe(true);
  });

  it('refuses to render without images', async () => {
    disk.files.clear();

    await expect(apply()).rejects.toThrow(
      'No image files found in the specified directory',
    );
    expect(renders.size).toBe(0);
  });

  it.each(['slide', 'merge', 'audio'])(
    'produces no final video when the %s step fails',
    async (step) => {
      failingStep = step;

      await expect(apply({ dimensions, slideText })).rejects.toThrow(
        `${step} failed`,
      );
      expect(renders.has(`/tmp/output-${ID}/final.mp4`)).toBe(false);
    },
  );
});
