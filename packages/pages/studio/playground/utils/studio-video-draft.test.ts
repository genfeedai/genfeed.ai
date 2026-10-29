import { MODEL_KEYS } from '@genfeedai/contracts/constants';
import type { IModel } from '@genfeedai/contracts/interfaces';
import { getDefaultStudioPlaygroundSettings } from '@pages/studio/playground/utils/studio-playground-settings';
import { buildVideoDraftSettings } from '@pages/studio/playground/utils/studio-video-draft';
import { describe, expect, it } from 'vitest';

function model(key: string, overrides: Partial<IModel> = {}): IModel {
  return { durations: [4, 6, 8], key, ...overrides } as IModel;
}

const videoSettings = {
  ...getDefaultStudioPlaygroundSettings('video'),
  duration: 8,
  isAudioEnabled: true,
  modelKey: MODEL_KEYS.REPLICATE_GOOGLE_VEO_3_1,
  outputs: 2,
  resolution: '1080p',
};

describe('buildVideoDraftSettings', () => {
  it('drafts Veo 3.1 on Lite, shortest, silent and single', () => {
    const draft = buildVideoDraftSettings(videoSettings, [
      model(MODEL_KEYS.REPLICATE_GOOGLE_VEO_3_1),
      model(MODEL_KEYS.REPLICATE_GOOGLE_VEO_3_1_FAST),
      model(MODEL_KEYS.REPLICATE_GOOGLE_VEO_3_1_LITE),
    ]);

    expect(draft).toMatchObject({
      duration: 4,
      isAudioEnabled: false,
      modelKey: MODEL_KEYS.REPLICATE_GOOGLE_VEO_3_1_LITE,
      outputs: 1,
    });
  });

  it('drafts Veo 3.1 on its fast sibling when Lite is not on offer', () => {
    const draft = buildVideoDraftSettings(videoSettings, [
      model(MODEL_KEYS.REPLICATE_GOOGLE_VEO_3_1),
      model(MODEL_KEYS.REPLICATE_GOOGLE_VEO_3_1_FAST),
    ]);

    expect(draft).toMatchObject({
      duration: 4,
      isAudioEnabled: false,
      modelKey: MODEL_KEYS.REPLICATE_GOOGLE_VEO_3_1_FAST,
      outputs: 1,
    });
  });

  it('keeps every other setting of the real request', () => {
    const draft = buildVideoDraftSettings(
      { ...videoSettings, aspectRatio: '9:16' },
      [
        model(MODEL_KEYS.REPLICATE_GOOGLE_VEO_3_1),
        model(MODEL_KEYS.REPLICATE_GOOGLE_VEO_3_1_FAST),
      ],
    );

    expect(draft?.aspectRatio).toBe('9:16');
  });

  it('drafts a model with no sibling on itself', () => {
    const draft = buildVideoDraftSettings(
      {
        ...videoSettings,
        duration: 10,
        modelKey: MODEL_KEYS.REPLICATE_BYTEDANCE_SEEDANCE_2_0_FAST,
      },
      [
        model(MODEL_KEYS.REPLICATE_BYTEDANCE_SEEDANCE_2_0_FAST, {
          durations: [5, 10, 15],
        }),
      ],
    );

    expect(draft).toMatchObject({
      duration: 5,
      isAudioEnabled: false,
      modelKey: MODEL_KEYS.REPLICATE_BYTEDANCE_SEEDANCE_2_0_FAST,
    });
  });

  it('has no draft when the sibling is not on offer', () => {
    expect(
      buildVideoDraftSettings(videoSettings, [
        model(MODEL_KEYS.REPLICATE_GOOGLE_VEO_3_1),
      ]),
    ).toBeNull();
  });

  it('has no draft for Auto or an unknown model', () => {
    const models = [model(MODEL_KEYS.REPLICATE_GOOGLE_VEO_3_1)];
    expect(
      buildVideoDraftSettings({ ...videoSettings, modelKey: 'auto' }, models),
    ).toBeNull();
    expect(
      buildVideoDraftSettings({ ...videoSettings, modelKey: 'x/y' }, models),
    ).toBeNull();
  });

  it('has no draft when the settings are already as cheap as one', () => {
    const cheapest = {
      ...videoSettings,
      duration: 5,
      isAudioEnabled: false,
      modelKey: MODEL_KEYS.REPLICATE_BYTEDANCE_SEEDANCE_2_0_FAST,
      outputs: 1,
      resolution: '720p',
    };
    expect(
      buildVideoDraftSettings(cheapest, [
        model(MODEL_KEYS.REPLICATE_BYTEDANCE_SEEDANCE_2_0_FAST, {
          durations: [5, 10, 15],
        }),
      ]),
    ).toBeNull();
  });
});
