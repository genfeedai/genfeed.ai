import type { CrunModelInputContract } from '@genfeedai/contracts/interfaces';
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
