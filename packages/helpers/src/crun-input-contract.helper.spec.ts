import type {
  CrunInputControls,
  CrunModelInputContract,
} from '@genfeedai/contracts/interfaces';
import {
  normalizeCrunInput,
  projectCrunInputControls,
} from '@genfeedai/helpers';
import { describe, expect, it } from 'vitest';

const nano: CrunModelInputContract = {
  endpoint: 'google/nano-banana-pro',
  fields: {
    prompt: {
      type: 'string',
      isRequired: true,
      minLength: 1,
      maxLength: 20000,
    },
    img_urls: {
      type: 'array',
      isRequired: false,
      minItems: 1,
      maxItems: 8,
      format: 'uri',
    },
    resolution: {
      type: 'string',
      isRequired: false,
      enum: ['1K', '2K', '4K'],
      default: '1K',
    },
    aspect_ratio: {
      type: 'string',
      isRequired: false,
      enum: ['1:1', 'auto'],
      default: '1:1',
    },
    output_format: {
      type: 'string',
      isRequired: false,
      enum: ['png', 'jpg'],
      default: 'png',
    },
  },
  isAutoAspectReferenceRequired: true,
  mediaKind: 'image',
  referenceRoles: { img_urls: 'image' },
  serverOverrides: {},
  version: 'fixture-nano',
};

describe('reviewed Crun input admission', () => {
  it('normalizes omitted defaults and empty references without changing prompt', () => {
    expect(
      normalizeCrunInput(nano, { prompt: '  exact prompt  ', img_urls: [] }),
    ).toEqual({
      isValid: true,
      input: {
        prompt: '  exact prompt  ',
        resolution: '1K',
        aspect_ratio: '1:1',
        output_format: 'png',
      },
    });
  });

  it.each([0, 20001])('rejects prompt length %i', (length) => {
    expect(normalizeCrunInput(nano, { prompt: 'x'.repeat(length) })).toEqual({
      isValid: false,
      errors: [{ field: 'prompt', code: 'bounds' }],
    });
  });

  it.each([
    'seed',
    'audio',
    'duration',
    'num_outputs',
    'enhance_prompt',
    'content_moderation',
  ])('rejects unknown caller field %s', (field) => {
    expect(normalizeCrunInput(nano, { prompt: 'x', [field]: false })).toEqual({
      isValid: false,
      errors: [{ field, code: 'unknown' }],
    });
  });

  it('requires a reference for auto, rejects non-HTTPS URLs and oversized reference arrays', () => {
    expect(
      normalizeCrunInput(nano, { prompt: 'x', aspect_ratio: 'auto' }),
    ).toEqual({
      isValid: false,
      errors: [{ field: 'aspect_ratio', code: 'reference_required' }],
    });
    expect(
      normalizeCrunInput(nano, {
        prompt: 'x',
        img_urls: ['http://asset.test/x'],
      }),
    ).toEqual({
      isValid: false,
      errors: [{ field: 'img_urls', code: 'uri' }],
    });
    expect(
      normalizeCrunInput(nano, {
        prompt: 'x',
        img_urls: Array(9).fill('https://asset.test/x'),
      }),
    ).toEqual({
      isValid: false,
      errors: [{ field: 'img_urls', code: 'bounds' }],
    });
    expect(
      normalizeCrunInput(nano, {
        prompt: 'x',
        aspect_ratio: 'auto',
        img_urls: ['https://asset.test/x'],
      }).isValid,
    ).toBe(true);
  });

  it('rejects explicit invalid values instead of substituting defaults', () => {
    expect(
      normalizeCrunInput(nano, {
        prompt: 'x',
        resolution: '8K',
        output_format: null,
      }),
    ).toEqual({
      isValid: false,
      errors: [
        { field: 'resolution', code: 'enum' },
        { field: 'output_format', code: 'type' },
      ],
    });
  });

  it('allowlists projected field attributes instead of forwarding raw metadata', () => {
    const controls = projectCrunInputControls({
      ...nano,
      fields: {
        ...nano.fields,
        prompt: {
          ...nano.fields.prompt,
          pricing: 'private',
        } as typeof nano.fields.prompt,
      },
    });
    expect(controls.fields.prompt).not.toHaveProperty('pricing');
  });

  it('keeps provider moderation and one-output overrides server-only', () => {
    const seedream = {
      ...nano,
      serverOverrides: { content_moderation: true, num_outputs: 1 },
    };
    const controls = projectCrunInputControls(seedream);
    expect(controls).not.toHaveProperty('serverOverrides');
    expect(normalizeCrunInput(seedream, { prompt: 'x' })).toMatchObject({
      isValid: true,
      input: { content_moderation: true, num_outputs: 1 },
    });
    expect(
      normalizeCrunInput(seedream, { prompt: 'x', content_moderation: false })
        .isValid,
    ).toBe(false);
  });
});

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

describe('shared video normalization and projection', () => {
  it('applies defaults, priced duration and conditional aspect omission', () => {
    expect(
      normalizeCrunInput(controlsFor(), { prompt: 'motion' }),
    ).toMatchObject({
      isValid: true,
      input: { duration: 5, cfg_scale: 0.5, aspect_ratio: '16:9' },
    });
    const result = normalizeCrunInput(controlsFor(), {
      prompt: 'motion',
      img_urls: ['https://example.com/frame'],
    });
    if (!result.isValid) throw new Error('Invalid fixture');
    expect(result.input).not.toHaveProperty('aspect_ratio');
    expect(
      normalizeCrunInput(controlsFor('google/veo3-1-fast-t2v'), {
        prompt: 'motion',
        duration: 4,
      }),
    ).toMatchObject({
      isValid: false,
      errors: [{ field: 'duration', code: 'pricing_unavailable' }],
    });
    expect(
      normalizeCrunInput(controlsFor('google/veo3-1-fast-t2v'), {
        prompt: 'motion',
        img_urls: ['https://example.com/frame'],
      }),
    ).toMatchObject({
      isValid: false,
      errors: [{ field: 'img_urls', code: 'unknown' }],
    });
  });
  it('projects safe video metadata and independently copied arrays', () => {
    const source = {
      ...controlsFor(),
      serverOverrides: {},
      fields: {
        ...controlsFor().fields,
        seed: { type: 'integer' as const, isRequired: false },
      },
    };
    const controls = projectCrunInputControls(source);
    expect(controls.fields).not.toHaveProperty('seed');
    expect(controls).not.toHaveProperty('serverOverrides');
    expect(controls.referenceRoles).toEqual({ img_urls: 'image' });
    expect(controls.videoRules).toEqual(source.videoRules);
    expect(controls.videoRules).not.toBe(source.videoRules);
    expect(controls.videoRules?.availableDurations).not.toBe(
      source.videoRules?.availableDurations,
    );
    expect(controls.fields.duration.enum).not.toBe(source.fields.duration.enum);
    expect(
      projectCrunInputControls({
        ...controlsFor('google/veo3-1-fast-t2v'),
        serverOverrides: {},
      }).referenceRoles,
    ).toEqual({});
  });
});

it('preserves distinct Seedream defaults and reference-driven auto without video omission', () => {
  const seedream: CrunModelInputContract = {
    ...nano,
    endpoint: 'seedream/seedream-4.5',
    version: 'fixture-seedream',
    fields: {
      prompt: nano.fields.prompt,
      img_urls: nano.fields.img_urls,
      resolution: {
        type: 'string',
        isRequired: false,
        enum: ['2K', '4K'],
        default: '2K',
      },
      aspect_ratio: nano.fields.aspect_ratio,
    },
    serverOverrides: { content_moderation: true, num_outputs: 1 },
  };
  const controls = projectCrunInputControls(seedream);
  expect(controls.fields).not.toHaveProperty('output_format');
  expect(controls).not.toHaveProperty('videoRules');
  expect(
    normalizeCrunInput(seedream, {
      prompt: 'x',
      aspect_ratio: 'auto',
      img_urls: ['https://example.com/frame'],
    }),
  ).toEqual({
    isValid: true,
    input: {
      prompt: 'x',
      img_urls: ['https://example.com/frame'],
      resolution: '2K',
      aspect_ratio: 'auto',
      content_moderation: true,
      num_outputs: 1,
    },
  });
});
