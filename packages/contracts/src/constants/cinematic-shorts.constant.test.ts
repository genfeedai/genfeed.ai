import { describe, expect, it } from 'vitest';
import {
  type CinematicShort,
  type CinematicShortSlots,
  cinematicShortSchema,
} from '../api-types/contracts/cinematic-short.contract';
import {
  CinematicShortCompileError,
  type CinematicShortCompileErrorCode,
  compileCinematicShort,
} from './cinematic-short-compiler';
import { CINEMATIC_SHORTS } from './cinematic-shorts.constant';

const [preset] = CINEMATIC_SHORTS;
const slots: CinematicShortSlots = preset.example;

function compileError(
  run: () => unknown,
): CinematicShortCompileErrorCode | undefined {
  try {
    run();
  } catch (error) {
    return error instanceof CinematicShortCompileError ? error.code : undefined;
  }
  return undefined;
}

describe('cinematic short catalog', () => {
  it('seeds valid presets with unique keys', () => {
    expect(new Set(CINEMATIC_SHORTS.map((short) => short.key)).size).toBe(
      CINEMATIC_SHORTS.length,
    );
    expect(
      CINEMATIC_SHORTS.map(
        (short) => cinematicShortSchema.safeParse(short).success,
      ),
    ).toEqual(CINEMATIC_SHORTS.map(() => true));
  });

  it('describes the style by feel, never by a named studio', () => {
    const texts = CINEMATIC_SHORTS.flatMap((short) => [
      short.styleByFeel,
      short.description,
      ...short.negativeList,
    ]);
    expect(texts.join(' ').toLowerCase()).not.toMatch(
      /ghibli|miyazaki|pixar|disney|shinkai/,
    );
  });

  it('rejects shots with a gap, an overlap or a late first shot', () => {
    const withShots = (shots: CinematicShort['shots']) =>
      cinematicShortSchema.safeParse({ ...preset, shots }).success;
    const [first, second, ...rest] = preset.shots;
    expect(withShots([first, { ...second, startSeconds: 8 }, ...rest])).toBe(
      false,
    );
    expect(withShots([first, { ...second, startSeconds: 6 }, ...rest])).toBe(
      false,
    );
    expect(withShots([{ ...first, startSeconds: 1 }, second, ...rest])).toBe(
      false,
    );
  });
});

describe('compileCinematicShort', () => {
  it('compiles the example into nine contiguous shots of whole frames', () => {
    const result = compileCinematicShort({ preset, slots });
    expect(result).toMatchObject({
      aspectRatio: '21:9',
      fps: 24,
      frameCount: 1440,
      qaPassLimit: 2,
      runtimeSeconds: 60,
    });
    expect(result.shots.map((shot) => shot.key)).toEqual([
      'before-dawn',
      'reading-hall',
      'the-character',
      'blank-book',
      'library-stirs',
      'pages-burst',
      'sunrise',
      'the-great-bird',
      'the-last-page',
    ]);
    expect(result.shots.map((shot) => shot.frameCount)).toEqual([
      168, 168, 96, 168, 168, 168, 120, 192, 192,
    ]);
    expect(result.shots[1].startSeconds).toBe(result.shots[0].endSeconds);
  });

  it('fills the slots into the shots and the title card', () => {
    const result = compileCinematicShort({
      brandName: 'Genfeed',
      preset,
      slots,
    });
    expect(result.shots[2].action).toContain(
      'a small red fox carrying a paper lantern',
    );
    expect(result.shots[8].action).toContain('"Fable 5.5"');
    expect(result.titleCard).toEqual({
      sealText: '寓話',
      tagline: 'Every story begins with a blank page.',
      text: 'Fable 5.5',
    });
    expect(result.prompt).toContain('Cinematic anime short for Genfeed');
    expect(result.negativePrompt).toContain('no people on screen');
  });

  it('scales every shot when the runtime is shortened and still tiles it', () => {
    const result = compileCinematicShort({
      preset,
      slots: { ...slots, runtimeSeconds: 30 },
    });
    expect(result.frameCount).toBe(720);
    expect(result.runtimeSeconds).toBe(30);
    expect(result.shots.map((shot) => shot.frameCount)).toEqual([
      84, 84, 48, 84, 84, 84, 60, 96, 96,
    ]);
    expect(
      result.shots.reduce((total, shot) => total + shot.frameCount, 0),
    ).toBe(720);
    expect(result.shots[8].endSeconds).toBe(30);
  });

  it('reports the frame-snapped runtime', () => {
    const result = compileCinematicShort({
      preset,
      slots: { ...slots, runtimeSeconds: 30.01 },
    });
    expect(result.frameCount).toBe(720);
    expect(result.runtimeSeconds).toBe(30);
    expect(result.prompt).toContain('30 seconds, 24 fps');
  });

  it('keeps inherited palette stops inside a film with replaced shots', () => {
    const result = compileCinematicShort({
      preset,
      slots: {
        ...slots,
        shots: [
          {
            action: 'One',
            camera: 'Wide',
            endSeconds: 15,
            key: 'one',
            sound: 'Wind',
            startSeconds: 0,
            title: 'One',
          },
          {
            action: 'Two',
            camera: 'Close',
            endSeconds: 30,
            key: 'two',
            sound: 'Piano',
            startSeconds: 15,
            title: 'Two',
          },
        ],
      },
    });
    expect(result.paletteArc.map((stop) => stop.fromSecond)).toEqual([
      0, 12.5, 16, 19.5, 26,
    ]);
  });

  it('leaves seal text out when the preset has no seal', () => {
    const result = compileCinematicShort({
      preset: { ...preset, titleCard: { ...preset.titleCard, hasSeal: false } },
      slots,
    });
    expect(result.titleCard).not.toHaveProperty('sealText');
    expect(result.prompt).not.toContain('Seal:');
  });

  it('accepts ordinary words that resemble a studio name', () => {
    const result = compileCinematicShort({
      preset,
      slots: { ...slots, styleByFeel: 'A madhouse of swirling ink and motion' },
    });
    expect(result.prompt).toContain('madhouse of swirling ink');
  });

  it('is deterministic', () => {
    expect(compileCinematicShort({ preset, slots })).toEqual(
      compileCinematicShort({ preset, slots }),
    );
  });

  it.each<[CinematicShortCompileErrorCode, Partial<CinematicShortSlots>]>([
    ['RUNTIME_OUT_OF_RANGE', { runtimeSeconds: 91 }],
    ['RUNTIME_OUT_OF_RANGE', { runtimeSeconds: 0.1 }],
    ['QA_LIMIT_ABOVE_PRESET', { qaPassLimit: 3 }],
    [
      'NAMED_STYLE_REFERENCE',
      { styleByFeel: 'Hand-drawn anime in the style of a famous studio' },
    ],
    ['NAMED_STYLE_REFERENCE', { styleByFeel: 'Soft Ghibli backgrounds' }],
    ['INVALID_SLOTS', { subject: '' }],
    ['INVALID_SLOTS', { fps: 5 }],
    [
      'SHOT_TIMELINE_INVALID',
      {
        shots: [
          {
            action: 'a',
            camera: 'b',
            endSeconds: 5,
            key: 'one',
            sound: 'c',
            startSeconds: 0,
            title: 'One',
          },
          {
            action: 'a',
            camera: 'b',
            endSeconds: 9,
            key: 'two',
            sound: 'c',
            startSeconds: 4,
            title: 'Two',
          },
        ],
      },
    ],
  ])('rejects with %s', (code, patch) => {
    expect(
      compileError(() =>
        compileCinematicShort({ preset, slots: { ...slots, ...patch } }),
      ),
    ).toBe(code);
  });

  it('rejects a preset that does not match its schema', () => {
    expect(
      compileError(() =>
        compileCinematicShort({
          preset: { ...preset, fps: 1 },
          slots,
        }),
      ),
    ).toBe('INVALID_PRESET');
  });
});

describe('named style reference policy', () => {
  const styleError = (styleByFeel: string): CinematicShortCompileError => {
    try {
      compileCinematicShort({ preset, slots: { ...slots, styleByFeel } });
    } catch (error) {
      if (error instanceof CinematicShortCompileError) return error;
    }
    throw new Error('expected the style to be rejected');
  };

  it.each([
    [
      'a director beyond the fixed list',
      'Symmetric framing, Wes Anderson pastels',
    ],
    ['a name at the start of the text', 'Hayao Miyazaki watercolour skies'],
    ['a credit cue and one name', 'Slow dread, inspired by Kubrick'],
    ['a credit cue in capitals', 'DIRECTED BY Villeneuve, grey and vast'],
    ['a credit cue with an article', 'Painted by the Dutch masters'],
    ['an unlisted studio', 'Soft backgrounds like Studio Ponoc'],
  ])('rejects %s', (_label, styleByFeel) => {
    expect(styleError(styleByFeel).code).toBe('NAMED_STYLE_REFERENCE');
  });

  it.each([
    ['sentence case', 'Soft light falls on hand-drawn paper. Warm and quiet.'],
    ['one capitalized word per sentence', 'Quiet. Slow. Warm. Held.'],
    ['a lowercase colour run', 'cool blue dawn to golden hour light'],
    [
      'a cue followed by an ordinary word',
      'Inspired by hand-drawn ink and slow light',
    ],
    ['a resemblance to a studio name', 'A madhouse of swirling ink and motion'],
    ['abbreviations in capitals', 'Shot on 35MM film with a CRT glow'],
  ])('accepts %s', (_label, styleByFeel) => {
    const result = compileCinematicShort({
      preset,
      slots: { ...slots, styleByFeel },
    });
    expect(result.prompt).toContain(styleByFeel);
  });

  it('keeps the error short and actionable for a very long name', () => {
    const longName = `${'Alexandria '.repeat(30)}Montgomery`;

    const { message } = styleError(`Warm light, ${longName}`);

    expect(message).toBe(
      'Describe the style by feel; "Alexandria Alexandria Alexandria Alexand..." reads as a named reference. Write sentence case without studio, artist, director or film names.',
    );
  });
});
