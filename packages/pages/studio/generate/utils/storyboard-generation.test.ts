import { MODEL_KEYS } from '@genfeedai/constants';
import { IngredientFormat, ModelCategory } from '@genfeedai/enums';
import type { IImage, IModel } from '@genfeedai/interfaces';
import { describe, expect, it } from 'vitest';
import {
  buildStoryboardInterpolationPairs,
  getStoryboardCameraPrompt,
  getStoryboardInterpolationModels,
  isStoryboardInterpolationModel,
  resolveStoryboardDuration,
  resolveStoryboardFormat,
  resolveStoryboardModelKey,
} from './storyboard-generation';

const frames = [
  { id: 'frame-1' },
  { id: 'frame-2' },
  { id: 'frame-3' },
] as IImage[];

describe('storyboard generation utils', () => {
  it('builds adjacent interpolation pairs in frame order', () => {
    expect(buildStoryboardInterpolationPairs(frames, ' slow dolly ')).toEqual([
      {
        endImageId: 'frame-2',
        prompt: 'slow dolly',
        startImageId: 'frame-1',
      },
      {
        endImageId: 'frame-3',
        prompt: 'slow dolly',
        startImageId: 'frame-2',
      },
    ]);
  });

  it('omits prompts and invalid frame ids without changing valid order', () => {
    expect(
      buildStoryboardInterpolationPairs([
        { id: 'frame-1' },
        { id: '' },
        { id: 'frame-3' },
      ] as IImage[]),
    ).toEqual([]);
  });

  it('resolves camera prompt, duration, format, and model fallbacks', () => {
    expect(getStoryboardCameraPrompt('zoom-in', '')).toBe(
      'smooth zoom in, focusing on subject',
    );
    expect(getStoryboardCameraPrompt('custom', '  drift left  ')).toBe(
      'drift left',
    );
    expect(resolveStoryboardDuration(12)).toBe(10);
    expect(resolveStoryboardDuration(2)).toBe(3);
    expect(resolveStoryboardFormat(IngredientFormat.LANDSCAPE)).toBe(
      IngredientFormat.LANDSCAPE,
    );
    expect(resolveStoryboardFormat('unknown')).toBe(IngredientFormat.PORTRAIT);
    expect(
      resolveStoryboardModelKey(
        [
          { category: ModelCategory.VIDEO, key: 'fallback-model' },
          {
            category: ModelCategory.VIDEO,
            isDefault: true,
            key: 'default-model',
          },
        ] as IModel[],
        [],
      ),
    ).toBe('default-model');
    expect(
      resolveStoryboardModelKey([] as IModel[], ['configured-model']),
    ).toBe('');
  });

  it('filters and resolves only interpolation-capable video models', () => {
    const models = [
      {
        category: ModelCategory.VIDEO,
        hasInterpolation: false,
        isDefault: true,
        key: MODEL_KEYS.REPLICATE_KWAIVGI_KLING_V2_1,
      },
      {
        category: ModelCategory.IMAGE,
        hasInterpolation: true,
        key: 'image-model',
      },
      {
        category: ModelCategory.VIDEO,
        hasInterpolation: true,
        key: 'interpolation-model',
      },
    ] as IModel[];

    expect(isStoryboardInterpolationModel(models[0])).toBe(false);
    expect(isStoryboardInterpolationModel(models[2])).toBe(true);
    expect(getStoryboardInterpolationModels(models)).toEqual([models[2]]);
    expect(
      resolveStoryboardModelKey(
        [models[2]],
        [MODEL_KEYS.REPLICATE_KWAIVGI_KLING_V2_1],
      ),
    ).toBe('interpolation-model');
  });
});
