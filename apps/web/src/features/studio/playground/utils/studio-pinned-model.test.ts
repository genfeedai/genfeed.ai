import { MODEL_KEYS } from '@genfeedai/contracts/constants';
import { describe, expect, it } from 'vitest';
import { pinStudioSettingsToModel } from '@/features/studio/playground/utils/studio-pinned-model';
import { getDefaultStudioPlaygroundSettings } from '@/features/studio/playground/utils/studio-playground-settings';

const imageSettings = getDefaultStudioPlaygroundSettings('image');

describe('pinStudioSettingsToModel', () => {
  it('submits a non-FLUX model with the settings as they are', () => {
    const settings = {
      ...imageSettings,
      aspectRatio: '9:16',
      outputs: 3,
      resolution: '2K',
    };

    expect(
      pinStudioSettingsToModel(
        settings,
        MODEL_KEYS.REPLICATE_BYTEDANCE_SEEDREAM_4_5,
      ),
    ).toEqual({
      ...settings,
      modelKey: MODEL_KEYS.REPLICATE_BYTEDANCE_SEEDREAM_4_5,
    });
  });

  it('gives FLUX.3 the fixed controls an explicit pick sets', () => {
    expect(
      pinStudioSettingsToModel(
        { ...imageSettings, aspectRatio: '5:11', outputs: 4, resolution: '2K' },
        MODEL_KEYS.REPLICATE_BLACK_FOREST_LABS_FLUX_3_IMAGE,
      ),
    ).toMatchObject({
      aspectRatio: 'auto',
      modelKey: MODEL_KEYS.REPLICATE_BLACK_FOREST_LABS_FLUX_3_IMAGE,
      outputs: 1,
      resolution: '1k',
    });
  });

  it('keeps a FLUX.3 aspect ratio and resolution that are already valid', () => {
    expect(
      pinStudioSettingsToModel(
        { ...imageSettings, aspectRatio: '16:9', resolution: '1.5k' },
        MODEL_KEYS.REPLICATE_BLACK_FOREST_LABS_FLUX_3_IMAGE,
      ),
    ).toMatchObject({ aspectRatio: '16:9', outputs: 1, resolution: '1.5k' });
  });
});
