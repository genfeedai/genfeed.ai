import { MODEL_KEYS } from '@genfeedai/contracts/constants';
import { describe, expect, it } from 'vitest';
import {
  getImageQualityOptionsByModel,
  isImageQualitySupported,
} from './image-quality.helper';

describe('image-quality.helper', () => {
  it('exposes the GPT Image 2.5 OpenAPI quality enum including xhigh and max', () => {
    const values = getImageQualityOptionsByModel(
      MODEL_KEYS.REPLICATE_OPENAI_GPT_IMAGE_2_5_FLARE,
    ).map((option) => option.value);

    expect(values).toEqual(['low', 'medium', 'high', 'xhigh', 'max', 'auto']);
  });

  it.each([
    ['GPT Image 1.5', MODEL_KEYS.REPLICATE_OPENAI_GPT_IMAGE_1_5],
    ['GPT Image 2', MODEL_KEYS.REPLICATE_OPENAI_GPT_IMAGE_2],
  ])('keeps %s on the older high-top enum', (_label, modelKey) => {
    const values = getImageQualityOptionsByModel(modelKey).map(
      (option) => option.value,
    );

    expect(values).toEqual(['low', 'medium', 'high', 'auto']);
  });

  it('returns no quality control for models without a schema quality field', () => {
    expect(
      getImageQualityOptionsByModel(
        MODEL_KEYS.REPLICATE_BLACK_FOREST_LABS_FLUX_SCHNELL,
      ),
    ).toEqual([]);
    expect(
      isImageQualitySupported(
        MODEL_KEYS.REPLICATE_OPENAI_GPT_IMAGE_2_5_SUNBURST,
        'max',
      ),
    ).toBe(true);
    expect(
      isImageQualitySupported(MODEL_KEYS.REPLICATE_OPENAI_GPT_IMAGE_2, 'max'),
    ).toBe(false);
  });
});
