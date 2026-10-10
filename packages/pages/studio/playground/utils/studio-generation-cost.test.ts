import { MODEL_KEYS } from '@genfeedai/contracts/constants';
import { buildStudioGenerationQuoteRequest } from '@genfeedai/pricing';
import {
  buildBaseGenerationPayload,
  buildImagePayload,
} from '@pages/studio/playground/utils/generation-payloads';
import {
  buildStudioPromptData,
  getDefaultStudioPlaygroundSettings,
} from '@pages/studio/playground/utils/studio-playground-settings';
import { describe, expect, it } from 'vitest';

const imageSettings = getDefaultStudioPlaygroundSettings('image');
const videoSettings = getDefaultStudioPlaygroundSettings('video');

describe('buildStudioGenerationQuoteRequest', () => {
  it('asks the server to quote the exact dimensions Studio submits', () => {
    const key = MODEL_KEYS.REPLICATE_BYTEDANCE_SEEDREAM_4_5;
    const settings = {
      ...imageSettings,
      aspectRatio: '9:16',
      modelKey: key,
      outputs: 2,
      resolution: '2K',
    };
    const promptData = buildStudioPromptData({
      brandId: 'brand-1',
      promptText: 'A product',
      settings,
      type: 'image',
    });
    const payload = buildImagePayload(
      buildBaseGenerationPayload(promptData, key, 'brand-1'),
      promptData,
    );

    const request = buildStudioGenerationQuoteRequest({
      aspectRatio: settings.aspectRatio,
      height: promptData.height,
      modelKey: key,
      outputs: promptData.outputs,
      resolution: promptData.resolution,
      type: 'image',
      width: promptData.width,
    });

    expect(request).toMatchObject({
      category: 'image',
      height: payload.height,
      modelKey: key,
      outputs: payload.outputs,
      width: payload.width,
    });
  });

  it('never quotes Auto or a type the server does not price', () => {
    for (const modelKey of [undefined, '', 'auto', '__auto_model__'])
      expect(
        buildStudioGenerationQuoteRequest({
          modelKey,
          type: 'image',
        }),
      ).toBeNull();
    expect(
      buildStudioGenerationQuoteRequest({
        modelKey: MODEL_KEYS.REPLICATE_GOOGLE_IMAGEN_4,
        type: 'music',
      }),
    ).toBeNull();
  });

  it('quotes a video as one clip at the submitted resolution', () => {
    const request = buildStudioGenerationQuoteRequest({
      duration: 8,
      modelKey: MODEL_KEYS.REPLICATE_GOOGLE_IMAGEN_4,
      outputs: 4,
      resolution: 'not-a-resolution',
      type: 'video',
    });
    expect(request).toMatchObject({
      category: 'video',
      duration: 8,
      outputs: 1,
    });
    expect(videoSettings.outputs).toBeDefined();
  });

  it('quotes an image edit with outputs and no quality selector', () => {
    expect(
      buildStudioGenerationQuoteRequest({
        modelKey: MODEL_KEYS.REPLICATE_IDEOGRAM_AI_IDEOGRAM_4_5,
        outputs: 3,
        resolution: '1K',
        type: 'image-edit',
        referenceUrls: ['https://example.com/source.png'],
        editSize: 'source',
      }),
    ).toEqual({
      category: 'image-edit',
      referenceUrls: ['https://example.com/source.png'],
      editSize: 'source',
      modelKey: MODEL_KEYS.REPLICATE_IDEOGRAM_AI_IDEOGRAM_4_5,
      outputs: 3,
    });
  });

  it('sends the native resolution for FLUX.3 instead of a quality tier', () => {
    expect(
      buildStudioGenerationQuoteRequest({
        modelKey: MODEL_KEYS.REPLICATE_BLACK_FOREST_LABS_FLUX_3_IMAGE,
        outputs: 1,
        resolution: '1k',
        type: 'image',
      }),
    ).toMatchObject({ resolution: '1k' });
  });
});
