import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type {
  AdPresetParams,
  AdPresetReference,
} from '../api-types/contracts/ad-preset.contract';
import { MINIMAX_H3_MODEL_KEY } from '../api-types/contracts/video-generation-capability-profile.contract';
import {
  AdPresetCompileError,
  type AdPresetCompileErrorCode,
  type CompileAdPresetInput,
  compileAdPreset,
} from './ad-preset-compiler';
import { AD_PRESETS } from './ad-presets.constant';

// SYNTHETIC inputs. The creator's original sample was not supplied.
const params: AdPresetParams = {
  aspectRatio: '9:16',
  lensMm: 24,
  qualityLook: 'Low-quality phone selfie',
  dialogue: '  Try this.\nKeep "every" word — exactly!  ',
  referenceRoles: [
    { token: '@Image1', role: 'person' },
    { token: '@Audio1', role: 'voiceover' },
  ],
};
const references: AdPresetReference[] = [
  { token: '@Image1', kind: 'image' },
  { token: '@Audio1', kind: 'audio', duration: 6.2 },
];
const input = {
  preset: AD_PRESETS[0],
  params,
  references,
  model: MINIMAX_H3_MODEL_KEY,
};

describe('ad preset compiler (SYNTHETIC)', () => {
  it('matches the synthetic golden section by section, retains exact dialogue once and is deterministic', () => {
    const result = compileAdPreset(input);
    expect(result.prompt).toBe(
      readFileSync(
        new URL('./fixtures/ad-ugc-selfie.synthetic.txt', import.meta.url),
        'utf8',
      ).trimEnd(),
    );
    expect(result.prompt.split(params.dialogue)).toHaveLength(2);
    expect(result.duration).toBe(7);
    expect(compileAdPreset(input)).toEqual(result);
    expect(result.notice).toContain('no unchanged-audio guarantee');
    expect(result).not.toHaveProperty('generate_audio');
  });
  it.each<[AdPresetCompileErrorCode, Partial<CompileAdPresetInput>]>([
    ['MISSING_DIALOGUE', { params: { ...params, dialogue: ' ' } }],
    ['MISSING_AUDIO', { references: references.slice(0, 1) }],
    ['UNSUPPORTED_MODEL', { model: 'unreviewed/model' }],
    [
      'UNKNOWN_AUDIO_DURATION',
      {
        references: [references[0], { ...references[1], duration: undefined }],
      },
    ],
    [
      'UNKNOWN_AUDIO_DURATION',
      { references: [references[0], { ...references[1], duration: 0 }] },
    ],
    [
      'DURATION_OUT_OF_RANGE',
      { references: [references[0], { ...references[1], duration: 15.1 }] },
    ],
    ['DURATION_SHORTER_THAN_AUDIO', { params: { ...params, duration: 6 } }],
    ['DURATION_OUT_OF_RANGE', { params: { ...params, duration: 16 } }],
    [
      'PROMPT_TOO_LONG',
      { params: { ...params, dialogue: 'word '.repeat(2000) } },
    ],
    [
      'REFERENCE_ROLE_MISMATCH',
      {
        params: {
          ...params,
          referenceRoles: [{ token: '@Audio2', role: 'voiceover' }],
        },
      },
    ],
    [
      'REFERENCE_ROLE_MISMATCH',
      {
        params: {
          ...params,
          referenceRoles: [
            { token: '@Image1', role: 'voiceover' },
            { token: '@Audio1', role: 'person' },
          ],
        },
      },
    ],
  ])('rejects %s distinctly', (code, overrides) => {
    try {
      compileAdPreset({ ...input, ...overrides });
      throw new Error('Expected failure');
    } catch (error) {
      expect(error).toBeInstanceOf(AdPresetCompileError);
      expect(error).toMatchObject({ code });
    }
  });
  it('rounds up within model limits without shortening audio', () => {
    for (const [audio, duration] of [
      [2, 4],
      [4.1, 5],
      [14.9, 15],
      [15, 15],
    ]) {
      expect(
        compileAdPreset({
          ...input,
          references: [references[0], { ...references[1], duration: audio }],
        }).duration,
      ).toBe(duration);
    }
  });
  it('compiles each seed and preserves short dialogue without substring false positives', () => {
    for (const preset of AD_PRESETS) {
      expect(
        compileAdPreset({
          ...input,
          preset,
          params: { ...params, dialogue: 'the' },
        }).prompt,
      ).toContain('Say "the"');
    }
  });
  it('rejects edited templates that duplicate or omit dialogue', () => {
    for (const template of ['{{dialogue}} {{dialogue}}', 'No dialogue']) {
      expect(() =>
        compileAdPreset({
          ...input,
          preset: {
            ...input.preset,
            sections: input.preset.sections.map((section) =>
              section.key === 'dialogue' ? { ...section, template } : section,
            ),
          },
        }),
      ).toThrowError(AdPresetCompileError);
    }
  });
});
