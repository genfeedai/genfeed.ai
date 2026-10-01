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
  referenceRoles: { image_urls: 'image' },
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
    image_urls: { type: 'array', isRequired: false, maxItems: 14 },
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
