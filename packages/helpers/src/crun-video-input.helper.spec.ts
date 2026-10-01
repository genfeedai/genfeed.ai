import type {
  CrunInputControls,
  CrunVideoDraft,
} from '@genfeedai/contracts/interfaces';
import {
  createCrunVideoDraft,
  normalizeCrunVideoDraft,
} from '@genfeedai/helpers';
import { describe, expect, it } from 'vitest';

function controlsFor(endpoint = 'kling/v2-5-turbo-pro'): CrunInputControls {
  const kling = endpoint === 'kling/v2-5-turbo-pro';
  return {
    endpoint,
    version: 'reviewed-video-v1',
    mediaKind: 'video',
    maxOutputs: 4,
    isBatchSupported: false,
    isAutoAspectReferenceRequired: false,
    referenceRoles: kling ? { img_urls: 'image' } : {},
    videoRules: {
      referenceMode: kling ? 'start-end' : 'none',
      omitAspectRatioWithReferences: kling,
      availableDurations: kling ? [5, 10] : [8],
    },
    fields: {
      prompt: {
        type: 'string',
        isRequired: true,
        minLength: 1,
        maxLength: kling ? 2500 : 5000,
      },
      duration: {
        type: 'integer',
        isRequired: false,
        enum: kling ? [5, 10] : [4, 6, 8],
        default: kling ? 5 : 8,
      },
      aspect_ratio: {
        type: 'string',
        isRequired: false,
        enum: kling ? ['1:1', '16:9', '9:16'] : ['16:9', '9:16'],
        default: '16:9',
      },
      ...(kling
        ? {
            negative_prompt: {
              type: 'string' as const,
              isRequired: false,
              maxLength: 2000,
            },
            cfg_scale: {
              type: 'number' as const,
              isRequired: false,
              minimum: 0,
              maximum: 1,
              default: 0.5,
            },
            img_urls: {
              type: 'array' as const,
              isRequired: false,
              format: 'uri' as const,
              minItems: 1,
              maxItems: 2,
            },
          }
        : {
            resolution: {
              type: 'string' as const,
              isRequired: false,
              enum: ['720p', '1080p', '4k'],
              default: '720p',
            },
            translate_prompt: {
              type: 'boolean' as const,
              isRequired: false,
              default: true,
            },
          }),
    },
  };
}

function draftFor(controls = controlsFor()): CrunVideoDraft {
  const draft = createCrunVideoDraft(controls, '  motion  ');
  if (!draft) throw new Error('Invalid fixture');
  return draft;
}
function invalid(
  patch: Partial<CrunVideoDraft>,
  field: string,
  code: string,
  controls = controlsFor(),
  mode: 'id' | 'url' = 'id',
) {
  expect(
    normalizeCrunVideoDraft(
      controls,
      { ...draftFor(controls), ...patch },
      mode,
    ),
  ).toEqual(
    expect.objectContaining({
      isValid: false,
      errors: expect.arrayContaining([{ field, code }]),
    }),
  );
}
describe('pure reviewed video preparation', () => {
  it('creates exact defaults and replaces model state preserving only prompt', () => {
    const kling = draftFor();
    expect(kling).toEqual({
      modelKey: 'crun/kling/v2-5-turbo-pro',
      contractVersion: 'reviewed-video-v1',
      prompt: 'motion',
      duration: 5,
      aspectRatio: '16:9',
      guidanceScale: 0.5,
    });
    const veo = createCrunVideoDraft(
      controlsFor('google/veo3-1-fast-t2v'),
      kling.prompt,
    );
    expect(veo).toEqual({
      modelKey: 'crun/google/veo3-1-fast-t2v',
      contractVersion: 'reviewed-video-v1',
      prompt: 'motion',
      duration: 8,
      aspectRatio: '16:9',
      resolution: '720p',
      translatePrompt: true,
    });
    expect(veo).not.toHaveProperty('startFrameId');
    expect(veo).not.toHaveProperty('negativePrompt');
  });
  it.each([5, 10])('accepts Kling duration %s', (duration) => {
    expect(
      normalizeCrunVideoDraft(controlsFor(), {
        ...draftFor(),
        duration,
        guidanceScale: 0,
        negativePrompt: '  no blur  ',
      }),
    ).toMatchObject({
      isValid: true,
      input: { duration, cfg_scale: 0, negative_prompt: 'no blur' },
    });
  });
  it.each(['1:1', '16:9', '9:16'])('accepts Kling aspect %s', (aspectRatio) => {
    expect(
      normalizeCrunVideoDraft(controlsFor(), { ...draftFor(), aspectRatio })
        .isValid,
    ).toBe(true);
  });
  it.each(['720p', '1080p', '4k'])(
    'accepts Veo resolution %s and false',
    (resolution) => {
      const controls = controlsFor('google/veo3-1-fast-t2v');
      expect(
        normalizeCrunVideoDraft(controls, {
          ...draftFor(controls),
          resolution,
          translatePrompt: false,
        }),
      ).toMatchObject({
        isValid: true,
        input: { resolution, translate_prompt: false },
      });
    },
  );
  it.each(['16:9', '9:16'])('accepts Veo aspect %s', (aspectRatio) => {
    const controls = controlsFor('google/veo3-1-fast-t2v');
    expect(
      normalizeCrunVideoDraft(controls, { ...draftFor(controls), aspectRatio })
        .isValid,
    ).toBe(true);
  });
  it.each([4, 6])('rejects unpriced Veo duration %s', (duration) =>
    invalid(
      { duration },
      'duration',
      'pricing_unavailable',
      controlsFor('google/veo3-1-fast-t2v'),
    ),
  );
  it('maps ordered IDs and omits both supplied/default aspect with frames', () => {
    for (const patch of [
      { startFrameId: 'start' },
      { startFrameId: 'start', endFrameId: 'end' },
    ]) {
      const result = normalizeCrunVideoDraft(controlsFor(), {
        ...draftFor(),
        ...patch,
      });
      expect(result).toMatchObject({
        isValid: true,
        input: { img_urls: patch.endFrameId ? ['start', 'end'] : ['start'] },
      });
      if (result.isValid)
        expect(result.input).not.toHaveProperty('aspect_ratio');
    }
    invalid(
      { startFrameId: 'start', aspectRatio: 'auto' },
      'aspect_ratio',
      'enum',
    );
  });
  it('enforces frame order, duplicates, ID bounds and URL separation', () => {
    invalid({ endFrameId: 'end' }, 'endFrameId', 'reference_required');
    invalid(
      { startFrameId: 'same', endFrameId: 'same' },
      'endFrameId',
      'bounds',
    );
    invalid({ startFrameId: 'x'.repeat(257) }, 'startFrameId', 'bounds');
    for (const startFrameId of ['has space', 'https://example.com/a', '/asset'])
      invalid({ startFrameId }, 'startFrameId', 'uri');
    expect(
      normalizeCrunVideoDraft(controlsFor(), {
        ...draftFor(),
        startFrameId: 'x'.repeat(256),
        endFrameId: '',
      }).isValid,
    ).toBe(true);
    expect(
      normalizeCrunVideoDraft(
        controlsFor(),
        {
          ...draftFor(),
          startFrameId: 'https://example.com/start',
          endFrameId: 'https://example.com/end',
        },
        'url',
      ),
    ).toMatchObject({
      isValid: true,
      input: {
        img_urls: ['https://example.com/start', 'https://example.com/end'],
      },
    });
    invalid(
      { startFrameId: 'http://example.com/a' },
      'img_urls',
      'uri',
      controlsFor(),
      'url',
    );
    invalid(
      { startFrameId: 'https://user:password@example.com/a' },
      'img_urls',
      'uri',
      controlsFor(),
      'url',
    );
  });
  it('rejects unsupported scalars, frames, unknown keys, identity and coercion', () => {
    const veo = controlsFor('google/veo3-1-fast-t2v');
    invalid({ startFrameId: 'start' }, 'startFrameId', 'unknown', veo);
    invalid({ endFrameId: 'end' }, 'endFrameId', 'unknown', veo);
    invalid({ negativePrompt: 'no blur' }, 'negative_prompt', 'unknown', veo);
    invalid({ guidanceScale: 0 }, 'cfg_scale', 'unknown', veo);
    invalid({ resolution: '720p' }, 'resolution', 'unknown');
    invalid({ translatePrompt: false }, 'translate_prompt', 'unknown');
    invalid({ modelKey: 'crun/other' }, 'modelKey', 'contract_mismatch');
    invalid(
      { contractVersion: 'other' },
      'contractVersion',
      'contract_mismatch',
    );
    invalid({ audio: true } as Partial<CrunVideoDraft>, 'audio', 'unknown');
    invalid(
      { duration: '5' } as unknown as Partial<CrunVideoDraft>,
      'duration',
      'type',
    );
  });
  it('enforces text, guidance and negative bounds without mutating controls', () => {
    invalid({ prompt: '' }, 'prompt', 'bounds');
    invalid({ prompt: 'x'.repeat(2501) }, 'prompt', 'bounds');
    invalid({ negativePrompt: 'x'.repeat(2001) }, 'negative_prompt', 'bounds');
    for (const guidanceScale of [-0.01, 1.01])
      invalid({ guidanceScale }, 'cfg_scale', 'bounds');
    invalid({ guidanceScale: Number.NaN }, 'cfg_scale', 'type');
    const controls = controlsFor();
    const original = structuredClone(controls);
    normalizeCrunVideoDraft(controls, {
      ...draftFor(),
      startFrameId: 'start',
      negativePrompt: '  ',
    });
    expect(controls).toEqual(original);
    expect(
      normalizeCrunVideoDraft(controls, {
        ...draftFor(),
        negativePrompt: '  ',
      }),
    ).toMatchObject({ isValid: true });
    const veo = controlsFor('google/veo3-1-fast-t2v');
    invalid({ prompt: 'x'.repeat(5001) }, 'prompt', 'bounds', veo);
  });
  it('fails closed for absent/wrong rules, image and unreviewed variants', () => {
    for (const controls of [
      { ...controlsFor(), mediaKind: 'image' as const },
      { ...controlsFor(), endpoint: 'kling/other' },
      { ...controlsFor(), videoRules: undefined },
      {
        ...controlsFor(),
        videoRules: {
          referenceMode: 'none' as const,
          omitAspectRatioWithReferences: true,
          availableDurations: [5, 10],
        },
      },
    ]) {
      expect(createCrunVideoDraft(controls, 'motion')).toBeNull();
      expect(normalizeCrunVideoDraft(controls, draftFor())).toMatchObject({
        isValid: false,
      });
    }
  });
});
