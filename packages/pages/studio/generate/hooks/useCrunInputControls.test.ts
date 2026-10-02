import type { CrunInputControls } from '@genfeedai/contracts/interfaces/content/crun-contract.interface';
import { describe, expect, it } from 'vitest';
import { getDefaultStudioGenerateSettings } from '../utils/studio-generate-settings';
import { normalizeCrunSettings } from './useCrunInputControls';

const controls: CrunInputControls = {
  endpoint: 'bytedance/seedream-4-5',
  version: 'reviewed-1',
  mediaKind: 'image',
  maxOutputs: 4,
  isBatchSupported: false,
  referenceRoles: { img_urls: 'image' },
  isAutoAspectReferenceRequired: false,
  fields: {
    aspect_ratio: {
      type: 'string',
      isRequired: false,
      default: '16:9',
      enum: ['1:1', '16:9'],
    },
    resolution: {
      type: 'string',
      isRequired: false,
      default: '2K',
      enum: ['2K', '4K'],
    },
    img_urls: { type: 'array', isRequired: false, maxItems: 14 },
  },
};
const settings = {
  ...getDefaultStudioGenerateSettings('image'),
  modelKey: 'crun/bytedance/seedream-4-5',
};
describe('reviewed Crun settings', () => {
  it('clears Nano output format and repairs incompatible values on a Seedream switch', () => {
    expect(
      normalizeCrunSettings(
        {
          ...settings,
          outputs: 8,
          aspectRatio: '4:5',
          crunControls: {
            modelKey: 'crun/google/nano-banana-pro',
            contractVersion: 'old',
            outputFormat: 'jpg',
          },
        },
        controls,
        0,
      ),
    ).toEqual({
      aspectRatio: '16:9',
      resolution: '2K',
      outputs: 4,
      crunControls: {
        modelKey: settings.modelKey,
        contractVersion: 'reviewed-1',
      },
    });
  });
  it('retains supported aspect, resolution and count across model/version changes', () => {
    expect(
      normalizeCrunSettings(
        { ...settings, resolution: '4K', outputs: 3 },
        controls,
        0,
      ),
    ).toEqual({
      crunControls: {
        modelKey: settings.modelKey,
        contractVersion: 'reviewed-1',
      },
    });
  });
  it('does not overwrite settings or editor values on a settled contract', () => {
    expect(
      normalizeCrunSettings(
        {
          ...settings,
          resolution: '2K',
          crunControls: {
            modelKey: settings.modelKey,
            contractVersion: 'reviewed-1',
          },
        },
        controls,
        0,
      ),
    ).toEqual({});
  });
  it('clears the residual envelope when selecting an incumbent model', () => {
    expect(
      normalizeCrunSettings(
        {
          ...settings,
          crunControls: {
            modelKey: settings.modelKey,
            contractVersion: 'reviewed-1',
          },
        },
        undefined,
        0,
      ),
    ).toEqual({ crunControls: undefined });
  });
  it('requires references for automatic aspect and reacts when the last reference is removed', () => {
    const nano = {
      ...controls,
      isAutoAspectReferenceRequired: true,
      fields: {
        ...controls.fields,
        aspect_ratio: {
          ...controls.fields.aspect_ratio,
          default: '1:1',
          enum: ['auto', '1:1'],
        },
      },
    };
    expect(
      normalizeCrunSettings({ ...settings, aspectRatio: 'auto' }, nano, 0)
        .aspectRatio,
    ).toBe('1:1');
    expect(
      normalizeCrunSettings({ ...settings, aspectRatio: 'auto' }, nano, 1)
        .aspectRatio,
    ).toBeUndefined();
  });
});

describe('Crun refreshed contract and residual normalization', () => {
  it('retains a valid output format after a reviewed version changes', () => {
    const nano = {
      ...controls,
      fields: {
        ...controls.fields,
        output_format: {
          type: 'string' as const,
          isRequired: false,
          enum: ['png', 'jpg'],
          default: 'png',
        },
      },
    };
    expect(
      normalizeCrunSettings(
        {
          ...settings,
          aspectRatio: '16:9',
          resolution: '2K',
          crunControls: {
            modelKey: settings.modelKey,
            contractVersion: 'old',
            outputFormat: 'jpg',
          },
        },
        nano,
        1,
      ).crunControls?.outputFormat,
    ).toBe('jpg');
  });
  it('clears a stale residual carrier when the canonical Studio ratio changes', () => {
    expect(
      normalizeCrunSettings(
        {
          ...settings,
          aspectRatio: '16:9',
          resolution: '2K',
          crunControls: {
            modelKey: settings.modelKey,
            contractVersion: controls.version,
            aspectRatio: '1:1',
          },
        },
        controls,
        1,
      ).crunControls,
    ).toEqual({
      modelKey: settings.modelKey,
      contractVersion: controls.version,
    });
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

describe('reviewed video defaults', () => {
  it('changes model and version once, clearing incompatible image/video residuals', () => {
    const controls = controlsFor('google/veo3-1-fast-t2v');
    const settings = {
      ...getDefaultStudioGenerateSettings('video'),
      modelKey: `crun/${controls.endpoint}`,
      duration: 10,
      resolution: '',
      crunControls: {
        modelKey: 'crun/kling/v2-5-turbo-pro',
        contractVersion: 'old',
        negativePrompt: 'old negative',
        guidanceScale: 0,
      },
    };
    const patch = normalizeCrunSettings(settings, controls, 0);
    expect(patch).toEqual({
      duration: 8,
      aspectRatio: '16:9',
      resolution: '720p',
      crunControls: {
        modelKey: settings.modelKey,
        contractVersion: controls.version,
        translatePrompt: true,
      },
    });
    expect(
      normalizeCrunSettings({ ...settings, ...patch }, controls, 0),
    ).toEqual({});
  });
  it('keeps Kling absent resolution empty and does not coerce it to undefined text', () => {
    const controls = controlsFor();
    expect(
      normalizeCrunSettings(
        {
          ...getDefaultStudioGenerateSettings('video'),
          modelKey: `crun/${controls.endpoint}`,
        },
        controls,
        0,
      ),
    ).toMatchObject({
      duration: 5,
      resolution: '',
      crunControls: { guidanceScale: 0.5 },
    });
  });
});
